import { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../../src/middleware/auth';
import { AppError } from '../../../src/middleware/errorHandler';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    process.env.API_KEY = 'test-api-key-123';
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
    };
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass authentication with valid API key', () => {
    mockRequest.headers = { 'x-api-key': 'test-api-key-123' };

    authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect((mockRequest as any).user).toEqual({
      role: 'ADMIN',
      authenticated: true,
      method: 'api-key',
    });
  });

  it('should fail authentication without API key', () => {
    mockRequest.headers = {};

    authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    const error = (nextFunction as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Authentication required');
  });

  it('should fail authentication with invalid API key', () => {
    mockRequest.headers = { 'x-api-key': 'invalid-key' };

    authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    const error = (nextFunction as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Invalid API key');
  });

  it('should fail if API_KEY environment variable is not set', () => {
    delete process.env.API_KEY;
    mockRequest.headers = { 'x-api-key': 'any-key' };

    authenticate(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    const error = (nextFunction as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(500);
    expect(error.message).toContain('Server configuration error');
  });
});

