import { Request, Response, NextFunction } from 'express';
import { createApiResponse, createPaginatedResponse, parsePaginationParams, AppError } from '../utils';
import { PaginationParams } from '../types';

/**
 * Base Controller with common CRUD operations
 */
export default class BaseController {
  /**
   * Handle success response
   */
  protected success(res: Response, data: any, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json(createApiResponse(true, message, data));
  }

  /**
   * Handle error response
   */
  protected error(res: Response, message: string, statusCode = 500, errorCode?: string) {
    return res.status(statusCode).json(createApiResponse(false, message, null, errorCode));
  }

  /**
   * Handle paginated response
   */
  protected paginated(res: Response, data: any[], total: number, pagination: PaginationParams, message = 'Data retrieved successfully') {
    const response = createPaginatedResponse(data, total, pagination, message);
    return res.status(200).json(response);
  }

  /**
   * Handle not found response
   */
  protected notFound(res: Response, resource = 'Resource') {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Handle validation error response
   */
  protected validationError(res: Response, errors: any) {
    return res.status(400).json(
      createApiResponse(false, 'Validation failed', { errors }, 'VALIDATION_ERROR')
    );
  }

  /**
   * Handle unauthorized response
   */
  protected unauthorized(res: Response, message = 'Unauthorized') {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  /**
   * Handle forbidden response
   */
  protected forbidden(res: Response, message = 'Forbidden') {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  /**
   * Parse pagination from request
   */
  protected getPagination(req: Request): PaginationParams {
    return parsePaginationParams(req.query);
  }

  /**
   * Get user from request
   */
  protected getUser(req: Request) {
    if (!req.user) {
      throw new AppError('User not found in request', 401);
    }
    return req.user;
  }

  /**
   * Get customer from request
   */
  protected getCustomer(req: Request) {
    if (!req.customer) {
      throw new AppError('Customer not found in request', 401);
    }
    return req.customer;
  }

  /**
   * Parse ID parameter
   */
  protected parseId(req: Request, paramName = 'id'): number {
    const id = parseInt(req.params[paramName]);
    if (isNaN(id) || id <= 0) {
      throw new AppError(`Invalid ${paramName} parameter`, 400);
    }
    return id;
  }

  /**
   * Validate required fields
   */
  protected validateRequired(data: any, fields: string[]) {
    const missing = fields.filter(field => !data[field]);
    if (missing.length > 0) {
      throw new AppError(`Missing required fields: ${missing.join(', ')}`, 400);
    }
  }

  /**
   * Handle async controller actions
   */
  protected asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Filter allowed fields from request body
   */
  protected filterFields(data: any, allowedFields: string[]): any {
    const filtered: any = {};
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        filtered[field] = data[field];
      }
    });
    return filtered;
  }

  /**
   * Common CRUD: Create
   */
  protected async handleCreate(Model: any, req: Request, res: Response, allowedFields?: string[]) {
    try {
      const data = allowedFields ? this.filterFields(req.body, allowedFields) : req.body;
      const record = await Model.create(data);
      return this.success(res, record, 'Record created successfully', 201);
    } catch (error: any) {
      if (error.statusCode) {
        return this.error(res, error.message, error.statusCode);
      }
      throw error;
    }
  }

  /**
   * Common CRUD: Get All with pagination
   */
  protected async handleGetAll(Model: any, req: Request, res: Response, filters?: any) {
    try {
      const pagination = this.getPagination(req);
      const where = filters || {};

      const { data, total } = await Model.findPaginated(pagination, { where });
      return this.paginated(res, data, total, pagination);
    } catch (error: any) {
      if (error.statusCode) {
        return this.error(res, error.message, error.statusCode);
      }
      throw error;
    }
  }

  /**
   * Common CRUD: Get by ID
   */
  protected async handleGetById(Model: any, req: Request, res: Response) {
    try {
      const id = this.parseId(req);
      const record = await Model.findById(id);

      if (!record) {
        return this.notFound(res, Model.name);
      }

      return this.success(res, record, 'Record retrieved successfully');
    } catch (error: any) {
      if (error.statusCode) {
        return this.error(res, error.message, error.statusCode);
      }
      throw error;
    }
  }

  /**
   * Common CRUD: Update
   */
  protected async handleUpdate(Model: any, req: Request, res: Response, allowedFields?: string[]) {
    try {
      const id = this.parseId(req);
      const data = allowedFields ? this.filterFields(req.body, allowedFields) : req.body;

      const record = await Model.updateById(id, data);

      if (!record) {
        return this.notFound(res, Model.name);
      }

      return this.success(res, record, 'Record updated successfully');
    } catch (error: any) {
      if (error.statusCode) {
        return this.error(res, error.message, error.statusCode);
      }
      throw error;
    }
  }

  /**
   * Common CRUD: Delete
   */
  protected async handleDelete(Model: any, req: Request, res: Response, softDelete = true) {
    try {
      const id = this.parseId(req);

      const success = softDelete
        ? await Model.softDeleteById(id)
        : await Model.deleteById(id);

      if (!success) {
        return this.notFound(res, Model.name);
      }

      return this.success(res, null, 'Record deleted successfully');
    } catch (error: any) {
      if (error.statusCode) {
        return this.error(res, error.message, error.statusCode);
      }
      throw error;
    }
  }
}