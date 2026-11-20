/*
 * Integration-test jest config. Runs only test/integration, with no coverage,
 * and writes its junit to test-results/integration/ so CI can report IT results
 * to Knex separately from unit results. Everything else inherits from the base.
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/integration/**/*.(ts|js)'],
  collectCoverage: false,
  coverageThreshold: undefined,
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/integration',
      outputName: 'test-results.xml'
    }]
  ]
};
