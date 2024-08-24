import * as commander from "commander";
import fs from "fs";

/**
 * Validators class to hold custom validation functions.
 */
class CommandLineValidators {
  /**
   * Custom validation function to ensure prefetchSize is a positive integer.
   * @param {string} value - The value to parse.
   * @param {number} previous - The previous value.
   * @returns {number} - The parsed positive integer.
   * @throws {commander.InvalidArgumentError} - If the value is not a positive integer.
   */
  static parseIntPositive(value) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      throw new commander.InvalidArgumentError('Prefetch size must be a positive integer.');
    }
    return parsedValue;
  }

  /**
   * Custom validation function to ensure runMode is either 'interval' or 'continuous'.
   * @param {string} value - The value to validate.
   * @returns {string} - The validated run mode.
   * @throws {commander.InvalidArgumentError} - If the value is not 'interval' or 'continuous'.
   */
  static validateRunMode(value) {
    const validModes = ['interval', 'continuous'];
    if (!validModes.includes(value)) {
      throw new commander.InvalidArgumentError('Run mode must be either "interval" or "continuous".');
    }
    return value;
  }

  /**
   * Custom validation function to ensure each path in the array exists and is a file.
   * @param {string[]} values - The array of paths to validate.
   * @returns {string[]} - The validated array of paths.
   * @throws {commander.InvalidArgumentError} - If any path does not exist or is not a file.
   */
  static fileExists(values) {
    if (!Array.isArray(values)) {
      values = [values];
    }
    values.forEach(value => {
      try {
        const stats = fs.statSync(value);
        if (!stats.isFile()) {
          throw new commander.InvalidArgumentError(`The path ${value} must be a file.`);
        }
      } catch (err) {
        throw new commander.InvalidArgumentError(`The path ${value} does not exist or is not accessible. ${err.message}`);
      }
    });
    return values;
  }
}

export default CommandLineValidators;