import logger from './logger.mjs';

/**
 * Gracefully shuts down the RabbitConsumer by closing the connection.
 * @param {RabbitConsumer} rabbitConsumer - The RabbitConsumer instance to shut down.
 * @returns {Promise<void>} Resolves when the shutdown process is complete.
 */
export default async function gracefulShutdown(rabbitConsumer) {
  logger.info('Shutting down...'); // Log the start of the shutdown process
  try {
    // Attempt to stop the RabbitConsumer and close the connection
    await rabbitConsumer.stop();
    logger.info('RabbitMQ connection closed'); // Log successful closure
    process.exit(0); // Exit the process with a success code
  } catch (err) {
    // Log any errors that occur during the shutdown process
    logger.error('Error during shutdown', err);
    process.exit(1); // Exit the process with an error code
  }
}