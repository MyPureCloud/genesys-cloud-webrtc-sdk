module.exports = {
  roots: [
    '<rootDir>/src',
    '<rootDir>/test'
  ],
  testMatch: [
    '<rootDir>/test/unit/**/*.(ts|js)',
    '<rootDir>/test/integration/**/*.(ts|js)'
  ],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['node'],
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.tsx?$': 'ts-jest'
  },
  moduleNameMapper: {
    // `@hp-inc/call-control-sdk` (pulled in transitively by
    // softphone-vendor-headsets) is a WASM-backed, pure-ESM hardware SDK that
    // uses `import.meta` and exposes no CommonJS `main` entry, so Jest can
    // neither resolve nor execute it. Redirect it to a stub for tests.
    '^@hp-inc/call-control-sdk$': '<rootDir>/test/__mocks__/call-control-sdk.ts'
  },
  transformIgnorePatterns: [
    // Add module name that needs to be transpiled
    // '/node_modules/(?!whatwg-fetch|stanza|xmpp-jid|genesys-cloud-streaming-client).+\\.js$'
  ],
  setupFiles: [
    '<rootDir>/test/setup.ts'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx,ts,tsx}',
    '!**/headset-types.ts',
    '!**/node_modules/**',
    '!**/types/**'
  ],
  coverageReporters: [
    'lcov', 'text', 'text-summary'
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/unit',
      outputName: 'test-results.xml'
    }]
  ]
};
