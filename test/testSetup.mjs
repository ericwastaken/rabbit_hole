import amqp from 'amqp-connection-manager';
import moment from 'moment';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from test.env
dotenv.config({ path: path.resolve('test', 'test.env') });

const QUEUE_NAME = 'test-queue';
const BROKER_URL = process.env.BROKER_URL;
const BROKER_USERNAME = process.env.BROKER_USERNAME;
const BROKER_PASSWORD = process.env.BROKER_PASSWORD;
const BROKER_PROTOCOL = process.env.BROKER_PROTOCOL || 'amqp';
const BROKER_PORT = process.env.BROKER_PORT || (BROKER_PROTOCOL === 'amqps' ? 5671 : 5672);

// Construct the RabbitMQ URL similar to the main script
const RABBITMQ_URL = `${BROKER_PROTOCOL}://${BROKER_USERNAME}:${BROKER_PASSWORD}@${BROKER_URL}:${BROKER_PORT}`;

async function emptyQueue(channelWrapper) {
  let msgCount = 0;
  await channelWrapper.waitForConnect(); // Ensure connection setup is complete
  do {
    const res = await channelWrapper.checkQueue(QUEUE_NAME);
    msgCount = res.messageCount;
    if (msgCount > 0) {
      await channelWrapper.purgeQueue(QUEUE_NAME);
    }
  } while (msgCount > 0);
}

export async function publishTestMessages(howManyPairs = 10) {
  const connection = amqp.connect([RABBITMQ_URL]);
  const channelWrapper = connection.createChannel({
    json: true,
    setup: channel => channel.assertQueue(QUEUE_NAME, { durable: true })
  });

  await channelWrapper.waitForConnect(); // Ensure connection setup is complete

  await emptyQueue(channelWrapper);

  const messages = [];
  for (let i = 0; i < howManyPairs; i++) {
    const timestamp = moment().toISOString();
    messages.push(`test message|${timestamp}|keep`);
    messages.push(`test message|${timestamp}|drop`);
  }

  for (const message of messages) {
    await channelWrapper.sendToQueue(QUEUE_NAME, message);
  }

  await channelWrapper.waitForConnect(); // Ensure connection setup is complete after sending messages

  await channelWrapper.close();
  await connection.close();
  console.log('Test messages published to queue.');
}

if (process.argv[1].endsWith('testSetup.mjs')) {
  publishTestMessages().catch(err => {
    console.error('Failed to publish test messages:', err);
    process.exit(1);
  });
}