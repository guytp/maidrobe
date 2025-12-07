/**
 * Jest JSON Reporter
 *
 * Custom reporter that writes test results to a JSON file for CI failure
 * summary parsing. This reporter runs alongside the default reporter,
 * preserving normal console output while also generating JSON results.
 *
 * Used by jest.config.js via the reporters array in CI environments.
 */
const fs = require('fs');
const path = require('path');

class JsonResultsReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunComplete(contexts, results) {
    const outputPath = path.join(__dirname, 'test-results.json');

    try {
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    } catch (error) {
      // Don't fail the test run if we can't write the results file
      console.error('Failed to write test-results.json:', error.message);
    }
  }
}

module.exports = JsonResultsReporter;
