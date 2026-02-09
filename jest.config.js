
export default {
    transform: {}, // Disable transformation for ESM
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1', // Handle .js extension imports
    },
    setupFiles: ['<rootDir>/jest.setup.js'],
};
