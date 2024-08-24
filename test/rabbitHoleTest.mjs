import { expect } from 'chai';
import { spawn } from 'child_process';
import amqp from 'amqp-connection-manager';
import dotenv from 'dotenv';
import path from 'path';
import { publishTestMessages } from './testSetup.mjs';

// Load environment variables from test.env
dotenv.config({ path: path.resolve('test', 'test.env') });

const QUEUE_NAME = 'test-queue';
const BROKER_URL = process.env.BROKER_URL;
const BROKER_USERNAME = process.env.BROKER_USERNAME;
const BROKER_PASSWORD = process.env.BROKER_PASSWORD;
const BROKER_PROTOCOL = process.env.BROKER_PROTOCOL || 'amqp';
const BROKER_PORT = process.env.BROKER_PORT || (BROKER_PROTOCOL === 'amqps' ? 5671 : 5672);

// Construct the RabbitMQ URL
const RABBITMQ_URL = `${BROKER_PROTOCOL}://${BROKER_USERNAME}:${BROKER_PASSWORD}@${BROKER_URL}:${BROKER_PORT}`;

// How many message pairs
const MESSAGE_PAIRS = 10;

describe('Rabbit Hole Tests', function () {
  this.timeout(10000); // Timeout of 10 seconds for this test

  before(async function () {
    await publishTestMessages();
  });

  it('Should consume 20 messages and drop 10 messages.', function (done) {
    const rabbitHole = spawn('node', [
      path.resolve('src', 'index.mjs'),
      '--prefetch-size=20',
      `--env-file=${path.resolve('test', 'test.env')}`,
      `--queue-config=${path.resolve('test', 'queue-conf-test.json5')}`
    ]);

    rabbitHole.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    rabbitHole.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    rabbitHole.on('close', async (code) => {
      console.log(`rabbit_hole process exited with code ${code}`);
      // Check the message count in the queue to ensure the messages were processed
      const connection = amqp.connect([RABBITMQ_URL]);
      const channelWrapper = connection.createChannel({
        json: true,
        setup: channel => channel.assertQueue(QUEUE_NAME, { durable: true })
      });
      await channelWrapper.waitForConnect(); // Ensure connection setup is complete
      const { messageCount } = await channelWrapper.checkQueue(QUEUE_NAME);
      expect(messageCount).to.equal(MESSAGE_PAIRS);
      await channelWrapper.close();
      await connection.close();
      done();
    });

    setTimeout(() => rabbitHole.kill('SIGINT'), 3000); // Run the process for 3 seconds to ensure it completes
  });
});