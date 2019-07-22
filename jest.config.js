module.exports = {
  roots: [
    '<rootDir>/src',
    '<rootDir>/test'
  ],
  testMatch: [
    '<rootDir>/test/unit/**/*.(ts|js)'
  ],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.tsx?$': 'ts-jest'
  },
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
