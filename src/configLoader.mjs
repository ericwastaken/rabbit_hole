import fs from 'fs';
import JSON5 from 'json5';

/**
 * ConfigLoader class to handle loading and merging queue configurations.
 */
class ConfigLoader {
  /**
   * Loads and merges queue configurations from the specified file paths.
   * @param {string[]} filePaths - Array of file paths to load configurations from.
   * @param logger - The logger instance to use for logging.
   * @returns {Object} Merged queue configuration object.
   */
  static loadQueueConfigs(filePaths, logger) {
    // Initialize an empty merged configuration object
    let mergedConfig = {
      default_regex: "", // Default regex pattern for message filtering
      queue_list: [] // List of queue configurations
    };

    // Iterate over each file path to load and merge configurations
    filePaths.forEach(filePath => {
      logger.debug(`Loading queue configuration from ${filePath}`);
      // Read the content of the configuration file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      // Parse the content using JSON5 to support JSON5 syntax
      const config = JSON5.parse(fileContent);
      // Merge the default regex pattern if it exists in the current config
      mergedConfig.default_regex = config.default_regex || mergedConfig.default_regex;
      // Concatenate the queue list from the current config to the merged config
      mergedConfig.queue_list = mergedConfig.queue_list.concat(config.queue_list);
    });

    // Return the merged configuration object
    return mergedConfig;
  }
}

export default ConfigLoader;