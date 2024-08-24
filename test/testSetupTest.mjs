import { expect } from 'chai';
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

describe('Test Setup Verification', function () {
  this.timeout(5000); // Increase timeout to give enough time for the operations

  it(`should purge "${QUEUE_NAME}" then publish ${MESSAGE_PAIRS} message pairs.`, async function () {
    // Publish test messages to the queue
    await publishTestMessages(MESSAGE_PAIRS);
    // Check the message count in the queue to ensure the messages were published
    const connection = amqp.connect([RABBITMQ_URL]);
    const channelWrapper = connection.createChannel({
      json: true,
      setup: channel => channel.assertQueue(QUEUE_NAME, { durable: true })
    });
    await channelWrapper.waitForConnect(); // Ensure connection setup is complete
    const { messageCount } = await channelWrapper.checkQueue(QUEUE_NAME);
    expect(messageCount).to.equal(MESSAGE_PAIRS*2);
    await channelWrapper.close();
    await connection.close();
  });
});