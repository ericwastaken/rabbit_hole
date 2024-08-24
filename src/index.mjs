#!/usr/bin/env node

import {Command, CommanderError} from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import logger from './logger.mjs';
import configLoader from './configLoader.mjs';
import RabbitConsumer from './rabbitConsumer.mjs';
import gracefulShutdown from './gracefulShutdown.mjs';
import CommandLineValidators from './commandLineValidators.mjs';
import { CronJob } from 'cron';

const program = new Command();

// Define command line options
program
  .option('--prefetch-size <int>', 'Number of messages to prefetch', CommandLineValidators.parseIntPositive, 100)
  .option('--logDroppedMessages', 'Log dropped messages to a file', false)
  .option('--logMessagePath <path>', 'Path to log dropped messages', './dropped-messages')
  .requiredOption('--env-file <path>', 'Path to .env file', CommandLineValidators.fileExists, (value, previous) => previous.concat([value]), [])
  .requiredOption('--queue-config <path>', 'Path to queue config file', CommandLineValidators.fileExists, (value, previous) => previous.concat([value]), [])
  .requiredOption('--runMode <continuous|interval>', 'Run mode: interval or continuous', CommandLineValidators.validateRunMode)
  .option('--runSchedule <cron>', 'CRON string for scheduling in interval mode')
  .option('--runDurationSeconds <int>', 'Duration in seconds for interval mode', CommandLineValidators.parseIntPositive)
  .option('--v', 'Set verbosity level', (value, previous) => previous + 1, 0);

// Parse command line arguments
program.parse(process.argv);
const options = program.opts();

// Set logging level based on verbosity
if (options.v === 1) {
  logger.level = 'verbose';
} else if (options.v === 2) {
  logger.level = 'debug';
} else if (options.v >= 3) {
  logger.level = 'silly';
}

// Log the parsed options for debugging
logger.info(`Prefetch Size: ${options.prefetchSize}`);
logger.info(`Env Files: ${options.envFile}`);
logger.info(`Queue Configs: ${options.queueConfig}`);
logger.info(`Log Dropped Messages: ${options.logDroppedMessages}`);
logger.info(`Log Message Path: ${options.logMessagePath}`);
logger.info(`Run Mode: ${options.runMode}`);
logger.info(`Run Schedule: ${options.runSchedule}`);
logger.info(`Run Duration Seconds: ${options.runDurationSeconds}`);
logger.info(`Verbosity: ${options.v}`);

// Load environment variables from specified .env files
options['envFile'].forEach(file => {
  logger.debug(`Loading environment variables from ${file}`);
  dotenv.config({ path: path.resolve(file) });
});

// Load queue configurations
const queueConfig = configLoader.loadQueueConfigs(options['queueConfig'], logger);

// If logging dropped messages, ensure the log directory exists
if (options.logDroppedMessages) {
  try {
    fs.mkdirSync(options.logMessagePath, { recursive: true });
  } catch (err) {
    logger.error(`Error creating log message path: ${err}`);
    process.exit(1);
  }
}

// Create an instance of RabbitConsumer with the provided options
const rabbitConsumer = new RabbitConsumer({
  brokerUrl: process.env.BROKER_URL,
  brokerUsername: process.env.BROKER_USERNAME,
  brokerPassword: process.env.BROKER_PASSWORD,
  brokerCACertPath: process.env.BROKER_CA_CERT_PATH,
  brokerProtocol: process.env.BROKER_PROTOCOL,
  brokerPort: parseInt(process.env.BROKER_PORT),
  prefetchSize: options.prefetchSize,
  queueConfig: queueConfig,
  logDroppedMessages: options.logDroppedMessages,
  logMessagePath: options.logMessagePath,
  logger: logger
});

// Function to start the RabbitConsumer
async function startConsumer() {
  await rabbitConsumer.start();
}

// Function to stop the RabbitConsumer
async function stopConsumer() {
  await rabbitConsumer.stop();
}

// Handle run modes
if (options.runMode === 'continuous') {
  startConsumer();
} else if (options.runMode === 'interval') {
  if (!options.runSchedule || !options.runDurationSeconds) {
    logger.error('Both --runSchedule and --runDurationSeconds are required in interval mode.');
    process.exit(1);
  }

  try {
    // Schedule the RabbitConsumer to run at the specified intervals
    const job = new CronJob(options.runSchedule, async () => {
      logger.info(`rabbit_hole interval started. Running for ${options.runDurationSeconds} seconds...`);
      await startConsumer();
      setTimeout(async () => {
        await stopConsumer();
        logger.info('rabbit_hole interval completed');
      }, options.runDurationSeconds * 1000);
    });
    job.start();
  } catch (error) {
    logger.error(`Failed to schedule rabbit_hole: ${error.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown on SIGINT and SIGTERM signals
process.on('SIGINT', () => gracefulShutdown(rabbitConsumer));
process.on('SIGTERM', () => gracefulShutdown(rabbitConsumer));