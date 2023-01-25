module.exports = {
	coverageDirectory: 'coverage',
	cacheDirectory: '.jest-cache',
	collectCoverage: true,
	collectCoverageFrom: ['<rootDir>/src/**/*.{js,jsx,ts,tsx}'],
	coverageReporters: ['html', 'text', 'cobertura'],
	// coverageThreshold: {
	// 	global: {
	// 		branches: 95,
	// 		functions: 95,
	// 		lines: 95,
	// 		statements: 95
	// 	}
	// },
	maxWorkers: 2,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
	moduleNameMapper: {
		'^src/(.*)$': '<rootDir>/src/$1'
	},
	reporters: ['default', ['jest-junit', {outputDirectory: './coverage'}]],

	// moduleNameMapper: {
	// 	"obsidian": "mocks/obsidian.ts"
	// },
	// transformIgnorePatterns: ["node_modules"],
	// testPathIgnorePatterns: ["node_modules"],
}
