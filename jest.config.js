module.exports = {
  roots: [
    '<rootDir>/src',
    '<rootDir>/test'
  ],
  testMatch: [
    '<rootDir>/test/unit/**/*.(ts|js)'
  ],
  // testPathIgnorePatterns: [
  //   '<rootDir>/test/helpers/*'
  // ],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.tsx?$': 'ts-jest'
  },
  // setupFilesAfterEnv: [
  //   '<rootDir>/test/helpers/setup-browser.js'
  // ],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!**/types/**'
  ],
  coverageReporters: [
    'lcov', 'text', 'text-summary'
  ],
  coverageDirectory: './coverage'
};
