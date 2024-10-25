import type {Config} from 'jest';

const config: Config = {
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
};

export default config;
