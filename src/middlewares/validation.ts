import { Request, Response, NextFunction } from 'express';
import { createApiResponse, isValidEmail, isValidPhone, isValidLicensePlate } from '../utils';

/**
 * Validation middleware factory
 */
export function validate(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];
    const data = req.method === 'GET' ? req.query : req.body;

    // Validate required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
          errors.push({
            field,
            message: `${field} is required`,
            code: 'REQUIRED_FIELD',
          });
        }
      }
    }

    // Validate field types and formats
    if (schema.fields) {
      for (const [field, rules] of Object.entries(schema.fields)) {
        const value = data[field];

        // Skip validation if field is not present and not required
        if (value === undefined || value === null) {
          continue;
        }

        // Type validation
        if (rules.type && typeof value !== rules.type) {
          errors.push({
            field,
            message: `${field} must be of type ${rules.type}`,
            code: 'INVALID_TYPE',
          });
          continue;
        }

        // String validations
        if (rules.type === 'string' || typeof value === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            errors.push({
              field,
              message: `${field} must be at least ${rules.minLength} characters long`,
              code: 'MIN_LENGTH',
            });
          }

          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push({
              field,
              message: `${field} must not exceed ${rules.maxLength} characters`,
              code: 'MAX_LENGTH',
            });
          }

          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push({
              field,
              message: rules.patternMessage || `${field} format is invalid`,
              code: 'INVALID_FORMAT',
            });
          }

          // Email validation
          if (rules.email && !isValidEmail(value)) {
            errors.push({
              field,
              message: `${field} must be a valid email address`,
              code: 'INVALID_EMAIL',
            });
          }

          // Phone validation
          if (rules.phone && !isValidPhone(value)) {
            errors.push({
              field,
              message: `${field} must be a valid phone number`,
              code: 'INVALID_PHONE',
            });
          }

          // License plate validation
          if (rules.licensePlate && !isValidLicensePlate(value)) {
            errors.push({
              field,
              message: `${field} must be a valid license plate (e.g., 59A-12345)`,
              code: 'INVALID_LICENSE_PLATE',
            });
          }
        }

        // Number validations
        if (rules.type === 'number' || typeof value === 'number') {
          if (rules.min && value < rules.min) {
            errors.push({
              field,
              message: `${field} must be at least ${rules.min}`,
              code: 'MIN_VALUE',
            });
          }

          if (rules.max && value > rules.max) {
            errors.push({
              field,
              message: `${field} must not exceed ${rules.max}`,
              code: 'MAX_VALUE',
            });
          }
        }

        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push({
            field,
            message: `${field} must be one of: ${rules.enum.join(', ')}`,
            code: 'INVALID_ENUM',
          });
        }

        // Custom validation
        if (rules.custom) {
          const customError = rules.custom(value, data);
          if (customError) {
            errors.push({
              field,
              message: customError,
              code: 'CUSTOM_VALIDATION',
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json(
        createApiResponse(false, 'Validation failed', { errors }, 'VALIDATION_ERROR')
      );
      return;
    }

    next();
  };
}

// Validation schema interfaces
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface FieldRule {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
  email?: boolean;
  phone?: boolean;
  licensePlate?: boolean;
  enum?: any[];
  custom?: (value: any, data: any) => string | null;
}

export interface ValidationSchema {
  required?: string[];
  fields?: Record<string, FieldRule>;
}

// Common validation schemas
export const commonSchemas = {
  // User validation
  createUser: {
    required: ['phone', 'password', 'full_name'],
    fields: {
      phone: { type: 'string' as const, phone: true },
      password: { type: 'string' as const, minLength: 6 },
      full_name: { type: 'string' as const, minLength: 2, maxLength: 255 },
      email: { type: 'string' as const, email: true },
      role: { type: 'string' as const, enum: ['admin', 'staff', 'customer'] },
    },
  },

  // Login validation
  login: {
    required: ['phone', 'password'],
    fields: {
      phone: { type: 'string' as const, phone: true },
      password: { type: 'string' as const, minLength: 1 },
    },
  },

  // Customer validation
  createCustomer: {
    required: ['full_name'],
    fields: {
      full_name: { type: 'string' as const, minLength: 2, maxLength: 255 },
      email: { type: 'string' as const, email: true },
      phone: { type: 'string' as const, phone: true },
      address: { type: 'string' as const, maxLength: 500 },
      gender: { type: 'string' as const, enum: ['male', 'female', 'other'] },
    },
  },

  // Vehicle validation
  createVehicle: {
    required: ['license_plate'],
    fields: {
      license_plate: { type: 'string' as const, licensePlate: true },
      brand: { type: 'string' as const, maxLength: 100 },
      model: { type: 'string' as const, maxLength: 100 },
      year: { type: 'number' as const, min: 1980, max: new Date().getFullYear() + 1 },
      color: { type: 'string' as const, maxLength: 50 },
      mileage: { type: 'number' as const, min: 0 },
    },
  },

  // Appointment validation
  createAppointment: {
    required: ['appointment_date', 'appointment_time'],
    fields: {
      customer_id: { type: 'number' as const },
      vehicle_id: { type: 'number' as const },
      service_id: { type: 'number' as const },
      appointment_date: {
        type: 'string' as const,
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        patternMessage: 'appointment_date must be in YYYY-MM-DD format'
      },
      appointment_time: {
        type: 'string' as const,
        pattern: /^\d{2}:\d{2}$/,
        patternMessage: 'appointment_time must be in HH:MM format'
      },
      notes: { type: 'string' as const, maxLength: 500 },
    },
  },

  // Service validation
  createService: {
    required: ['name', 'category_id'],
    fields: {
      category_id: { type: 'number' as const },
      name: { type: 'string' as const, minLength: 2, maxLength: 255 },
      description: { type: 'string' as const, maxLength: 1000 },
      short_description: { type: 'string' as const, maxLength: 500 },
      price: { type: 'number' as const, min: 0 },
      duration_minutes: { type: 'number' as const, min: 1, max: 1440 },
    },
  },

  // Pagination validation
  pagination: {
    fields: {
      page: { type: 'number' as const, min: 1 },
      limit: { type: 'number' as const, min: 1, max: 100 },
      sortBy: { type: 'string' as const },
      sortOrder: { type: 'string' as const, enum: ['ASC', 'DESC'] },
    },
  },
};

export default validate;