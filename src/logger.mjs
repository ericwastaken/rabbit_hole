import winston from 'winston';

/**
 * Creates a logger instance using Winston.
 * The logger is configured to log messages to the console with colorized output.
 */
const logger = winston.createLogger({
  level: 'info', // Set the logging level to 'debug'
  format: winston.format.combine(
    winston.format.colorize(), // Colorize the output
    winston.format.simple() // Use a simple format for the output
  ),
  transports: [
    new winston.transports.Console() // Log messages to the console
  ]
});

export default logger;