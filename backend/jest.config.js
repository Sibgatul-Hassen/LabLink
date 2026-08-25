module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/*.test.ts"],
  // These suites hit a real Postgres through Docker and hash passwords with
  // bcrypt; the 5s default is far too tight for their setup hooks.
  testTimeout: 30000,
};
