import amqp from 'amqp-connection-manager';
import fs from 'fs';
import path from 'path';

/**
 * RabbitConsumer class to handle consuming messages from RabbitMQ.
 */
class RabbitConsumer {
  /**
   * Constructs a RabbitConsumer instance.
   * @param {Object} config - Configuration object.
   * @param {string} config.brokerUrl - URL of the RabbitMQ broker.
   * @param {string} config.brokerUsername - Username for RabbitMQ broker.
   * @param {string} config.brokerPassword - Password for RabbitMQ broker.
   * @param {string} [config.brokerCACertPath] - Path to CA certificate for RabbitMQ broker.
   * @param {string} [config.brokerProtocol] - Protocol to use (amqp or amqps).
   * @param {number} [config.brokerPort] - Port for RabbitMQ broker.
   * @param {number} config.prefetchSize - Number of messages to prefetch.
   * @param {Object} config.queueConfig - Queue configuration object.
   * @param {boolean} config.logDroppedMessages - Flag to log dropped messages.
   * @param {string} config.logMessagePath - Path to log dropped messages.
   */
  constructor({ brokerUrl, brokerUsername, brokerPassword, brokerCACertPath, brokerProtocol, brokerPort, prefetchSize, queueConfig, logDroppedMessages, logMessagePath, logger }) {
    // Initialize RabbitConsumer with provided configuration
    this.brokerUrl = brokerUrl;
    this.brokerUsername = brokerUsername;
    this.brokerPassword = brokerPassword;
    this.brokerCACert = brokerCACertPath ? fs.readFileSync(path.resolve(brokerCACertPath), 'utf8') : null;
    this.brokerProtocol = brokerProtocol || (this.brokerCACert ? 'amqps' : 'amqp');
    this.brokerPort = brokerPort || (this.brokerProtocol === 'amqps' ? 5671 : 5672);
    this.prefetchSize = prefetchSize;
    this.queueConfig = queueConfig;
    this.logDroppedMessages = logDroppedMessages;
    this.logMessagePath = logMessagePath;
    this.connection = null; // Will hold the connection to RabbitMQ
    this.channelWrapper = null; // Will hold the channel wrapper for consuming messages
    this.logger = logger;
  }

  /**
   * Creates a connection to the RabbitMQ broker.
   * @returns {Promise<void>} Resolves when the connection is established.
   */
  async createConnection() {
    // Construct the connection URL
    const urls = [`${this.brokerProtocol}://${this.brokerUsername}:${this.brokerPassword}@${this.brokerUrl}:${this.brokerPort}`];
    this.logger.silly(`Prepared urls=${urls}`);
    const connectionOptions = this.brokerCACert ? { ca: [this.brokerCACert] } : {};
    this.logger.silly(`connectionOptions=${JSON.stringify(connectionOptions)}`);
    // Establish the connection
    this.logger.info(`Attempting to connect to RabbitMQ. If you don't see a 'Connected...' message, something is wrong!`);
    this.connection = amqp.connect(urls, connectionOptions);

    // Log connection events
    this.connection.on('connect', () => this.logger.info('Connected to RabbitMQ'));
    this.connection.on('disconnect', params => {
      this.logger.error(`Disconnected from RabbitMQ: ${params.err.stack}`);
      // Attempt to reconnect logic can go here if needed
    });

    let isConnected = false;
    let isDisconnected = false;

    this.connection.once('connect', () => {
      this.logger.info('Successfully connected to RabbitMQ');
      isConnected = true;
    });

    this.connection.once('disconnect', params => {
      this.logger.error(`Failed to connect to RabbitMQ: ${params.err.stack}`);
      isDisconnected = true;
    });

    return new Promise((resolve, reject) => {
      const checkConnection = () => {
        if (isConnected) {
          resolve();
        } else if (isDisconnected) {
          reject(new Error('Failed to connect to RabbitMQ'));
        } else {
          this.logger.silly('Still trying to connect to RabbitMQ...');
          setTimeout(checkConnection, 1000);
        }
      };

      checkConnection();
    });

  }

  /**
   * Starts the RabbitConsumer by establishing a connection and setting up channels.
   * @returns {Promise<void>} Resolves when the consumer is started.
   */
  async start() {
    try {
      // Establish the connection and create a channel
      await this.createConnection();
      this.logger.info(`Starting RabbitConsumer with prefetchSize: ${this.prefetchSize}`);
      this.channelWrapper = this.connection.createChannel({
        json: true,
        setup: channel =>
          // Set up the channel with the specified queues and prefetch size
          Promise.all(
            this.queueConfig.queue_list.map(queue =>
              channel.assertQueue(queue.queue_name, { durable: true })
                .then(() => channel.prefetch(this.prefetchSize))
            )
          )
      });

      // Start consuming messages from the queues
      this.consumeMessages();
    } catch (error) {
      this.logger.error(`Failed to start: ${error.stack}`);
      process.exit(1); // Exit the process if starting fails
    }
  }

  /**
   * Sets up message consumers for each queue in the configuration.
   */
  consumeMessages() {
    // Set up message consumers for each queue in the configuration
    this.queueConfig.queue_list.forEach(queueInfo => {
      this.channelWrapper.addSetup(channel =>
        // Consume messages with noAck: false to ensure messages are not lost
        channel.consume(queueInfo.queue_name, msg =>
          this.handleMessage(msg, queueInfo), { noAck: false }
        )
      );
    });
  }

  /**
   * Handles incoming messages and decides whether to drop or requeue them.
   * @param {Object} msg - The message object from RabbitMQ.
   * @param {Object} queueInfo - Information about the queue.
   * @returns {Promise<void>} Resolves when the message is handled.
   */
  async handleMessage(msg, queueInfo) {
    const content = msg.content.toString();

    // Handle incoming messages and decide whether to drop or requeue them
    if (msg.fields.redelivered) {
      // If the message is redelivered, requeue it
      await this.channelWrapper.nack(msg, false, true);
      this.logger.silly(`Message was already redelivered. Requeued message: ${content}`);
      return;
    }
    const regex = new RegExp(queueInfo.regex_to_drop || this.queueConfig.default_regex);

    if (regex.test(content)) {
      // If the message matches the drop regex, acknowledge and optionally log it
      await this.channelWrapper.ack(msg);
      this.logger.verbose(`Dropped message: ${content}`);
      if (this.logDroppedMessages) {
        this.logMessageToFile(msg);
      }
    } else {
      // If the message does not match the regex, requeue it
      await this.channelWrapper.nack(msg, false, true);
      this.logger.verbose(`Ignored message: ${content}`);
    }
  }

  /**
   * Logs the entire message object to a file.
   * @param {Object} msg - The message object from RabbitMQ.
   */
  logMessageToFile(msg) {
    // Log the entire message object to a file
    const logFilePath = path.resolve(this.logMessagePath, `${Date.now()}-${msg.fields.consumerTag}.log`);
    fs.writeFileSync(logFilePath, JSON.stringify(msg, null, 2));
    this.logger.debug(`Logged dropped message to ${logFilePath}`);
  }

  /**
   * Stops the RabbitConsumer by closing the connection.
   * @returns {Promise<void>} Resolves when the connection is closed.
   */
  async stop() {
    // Close the connection if it exists
    if (this.connection) {
      return await this.connection.close();
    }
    return Promise.resolve();
  }
}

export default RabbitConsumer;