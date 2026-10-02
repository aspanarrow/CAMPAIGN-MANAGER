import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * Validation middleware factory
 * Validates request data against a Zod schema
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request based on where data is located
      let dataToValidate: any = {};

      // Combine body, query, and params
      if (req.body && Object.keys(req.body).length > 0) {
        dataToValidate = { ...dataToValidate, ...req.body };
      }
      if (req.query && Object.keys(req.query).length > 0) {
        dataToValidate = { ...dataToValidate, ...req.query };
      }
      if (req.params && Object.keys(req.params).length > 0) {
        dataToValidate = { ...dataToValidate, ...req.params };
      }

      // Validate the combined data
      const validated = schema.parse(dataToValidate);

      // Replace original data with validated data
      if (req.body && Object.keys(req.body).length > 0) {
        req.body = validated;
      }
      if (req.query && Object.keys(req.query).length > 0) {
        req.query = validated;
      }
      if (req.params && Object.keys(req.params).length > 0) {
        req.params = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return next(new AppError('Validation error', 400, 'VALIDATION_ERROR', errorMessages));
      }
      next(error);
    }
  };
};

/**
 * Validate request body only
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return next(new AppError('Validation error', 400, 'VALIDATION_ERROR', errorMessages));
      }
      next(error);
    }
  };
};

/**
 * Validate query parameters only
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return next(new AppError('Validation error', 400, 'VALIDATION_ERROR', errorMessages));
      }
      next(error);
    }
  };
};

/**
 * Validate route parameters only
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return next(new AppError('Validation error', 400, 'VALIDATION_ERROR', errorMessages));
      }
      next(error);
    }
  };
};

