import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || 'test-store.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'test-token';
process.env.GEMINI_API_KEY = 'test-gemini-key';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

