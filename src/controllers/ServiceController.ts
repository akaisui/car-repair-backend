import { Request, Response } from 'express';
import BaseController from './BaseController';
import Service, { ServiceSearchFilters } from '../models/Service';
import ServiceCategory from '../models/ServiceCategory';
import { AppError } from '../utils';
import path from 'path';
import fs from 'fs/promises';

/**
 * Service Controller
 * Handles service management operations
 */
export default class ServiceController extends BaseController {
  private readonly allowedFields = [
    'category_id',
    'name',
    'slug',
    'description',
    'short_description',
    'price',
    'min_price',
    'max_price',
    'duration_minutes',
    'image_url',
    'is_featured',
    'is_active',
  ];

  private readonly imageUploadPath = path.join(process.cwd(), 'public', 'uploads', 'services');

  /**
   * Get all services with pagination and filters
   */
  getAllServices = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { category_id, is_active, is_featured } = req.query;

    let filters: any = {};

    if (category_id) filters.category_id = parseInt(category_id as string);
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (is_featured !== undefined) filters.is_featured = is_featured === 'true';

    const { data, total } = await Service.findPaginated(pagination, { where: filters });

    return this.paginated(res, data, total, pagination, 'Services retrieved successfully');
  });

  /**
   * Get service by ID
   */
  getServiceById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const service = await Service.findById(id);

    if (!service) {
      return this.notFound(res, 'Service');
    }

    return this.success(res, service, 'Service retrieved successfully');
  });

  /**
   * Get service by slug
   */
  getServiceBySlug = this.asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const service = await Service.findBySlug(slug);

    if (!service) {
      return this.notFound(res, 'Service');
    }

    return this.success(res, service, 'Service retrieved successfully');
  });

  /**
   * Create new service
   */
  createService = this.asyncHandler(async (req: Request, res: Response) => {
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate required fields
    this.validateRequired(data, ['name', 'slug']);

    // Validate category exists if provided
    if (data.category_id) {
      const category = await ServiceCategory.findById(data.category_id);
      if (!category) {
        throw new AppError('Service category not found', 400);
      }
    }

    // Check if slug already exists
    const existingService = await Service.findBySlug(data.slug);
    if (existingService) {
      throw new AppError('Service with this slug already exists', 400);
    }

    // Validate pricing
    if (data.price && (data.min_price || data.max_price)) {
      throw new AppError('Cannot set both fixed price and price range', 400);
    }

    if (data.min_price && data.max_price && data.min_price > data.max_price) {
      throw new AppError('Minimum price cannot be greater than maximum price', 400);
    }

    const service = await Service.create(data);
    return this.success(res, service, 'Service created successfully', 201);
  });

  /**
   * Update service
   */
  updateService = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate category exists if provided
    if (data.category_id) {
      const category = await ServiceCategory.findById(data.category_id);
      if (!category) {
        throw new AppError('Service category not found', 400);
      }
    }

    // Check if slug already exists (excluding current service)
    if (data.slug) {
      const existingService = await Service.findBySlug(data.slug);
      if (existingService && existingService.id !== id) {
        throw new AppError('Service with this slug already exists', 400);
      }
    }

    // Validate pricing
    if (data.price && (data.min_price || data.max_price)) {
      throw new AppError('Cannot set both fixed price and price range', 400);
    }

    if (data.min_price && data.max_price && data.min_price > data.max_price) {
      throw new AppError('Minimum price cannot be greater than maximum price', 400);
    }

    const service = await Service.updateById(id, data);

    if (!service) {
      return this.notFound(res, 'Service');
    }

    return this.success(res, service, 'Service updated successfully');
  });

  /**
   * Delete service (soft delete)
   */
  deleteService = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    const success = await Service.softDeleteById(id);

    if (!success) {
      return this.notFound(res, 'Service');
    }

    return this.success(res, null, 'Service deleted successfully');
  });

  /**
   * Search services with filters
   */
  searchServices = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { category_id, price_min, price_max, duration_min, duration_max, is_featured, search } =
      req.query;

    const filters: ServiceSearchFilters = {};

    if (category_id) filters.category_id = parseInt(category_id as string);
    if (price_min) filters.price_min = parseFloat(price_min as string);
    if (price_max) filters.price_max = parseFloat(price_max as string);
    if (duration_min) filters.duration_min = parseInt(duration_min as string);
    if (duration_max) filters.duration_max = parseInt(duration_max as string);
    if (is_featured !== undefined) filters.is_featured = is_featured === 'true';
    if (search) filters.search = search as string;

    filters.is_active = true; // Only search active services

    const services = await Service.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `s.${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count for pagination (simplified for demo)
    const total = services.length;

    return this.paginated(res, services, total, pagination, 'Services searched successfully');
  });

  /**
   * Get services by classification (basic, advanced, special)
   */
  getServicesByClassification = this.asyncHandler(async (req: Request, res: Response) => {
    const { classification } = req.params;

    if (!['basic', 'advanced', 'special'].includes(classification)) {
      throw new AppError('Invalid classification. Must be: basic, advanced, or special', 400);
    }

    const services = await Service.findByClassification(
      classification as 'basic' | 'advanced' | 'special'
    );

    return this.success(res, services, `${classification} services retrieved successfully`);
  });

  /**
   * Get featured services
   */
  getFeaturedServices = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const services = await Service.findFeatured(limit);

    return this.success(res, services, 'Featured services retrieved successfully');
  });

  /**
   * Get active services (public endpoint for booking form)
   */
  getActiveServices = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);

    // findActive already filters by is_active = true, so no need for additional filters
    const services = await Service.findActive({
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `s.${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count for pagination
    const total = await Service.count({ is_active: true });

    return this.paginated(res, services, total, pagination, 'Active services retrieved successfully');
  });

  /**
   * Get services with pricing information
   */
  getServicesWithPricing = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { category_id } = req.query;

    const filters: any = {};
    if (category_id) filters.category_id = parseInt(category_id as string);

    const options: any = {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `s.${pagination.sortBy} ${pagination.sortOrder}`,
    };

    // Only add where clause if filters has values
    if (Object.keys(filters).length > 0) {
      options.where = filters;
    }

    const services = await Service.findWithPricing(options);

    // Get total count (simplified)
    const total = services.length;

    return this.paginated(
      res,
      services,
      total,
      pagination,
      'Services with pricing retrieved successfully'
    );
  });

  /**
   * Get popular services
   */
  getPopularServices = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const services = await Service.findPopular(limit);

    return this.success(res, services, 'Popular services retrieved successfully');
  });

  /**
   * Update service pricing
   */
  updateServicePricing = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const { price, min_price, max_price } = req.body;

    // Validation
    if (price && (min_price || max_price)) {
      throw new AppError('Cannot set both fixed price and price range', 400);
    }

    if (min_price && max_price && min_price > max_price) {
      throw new AppError('Minimum price cannot be greater than maximum price', 400);
    }

    const pricing: any = {};
    if (price !== undefined) pricing.price = price;
    if (min_price !== undefined) pricing.min_price = min_price;
    if (max_price !== undefined) pricing.max_price = max_price;

    if (Object.keys(pricing).length === 0) {
      throw new AppError('At least one pricing field is required', 400);
    }

    const service = await Service.updatePricing(id, pricing);

    if (!service) {
      return this.notFound(res, 'Service');
    }

    return this.success(res, service, 'Service pricing updated successfully');
  });

  /**
   * Toggle service featured status
   */
  toggleFeatured = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    const service = await Service.toggleFeatured(id);

    if (!service) {
      return this.notFound(res, 'Service');
    }

    return this.success(
      res,
      service,
      `Service ${service.is_featured ? 'featured' : 'unfeatured'} successfully`
    );
  });

  /**
   * Upload service image
   */
  uploadServiceImage = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    if (!req.file) {
      throw new AppError('No image file provided', 400);
    }

    // Ensure upload directory exists
    try {
      await fs.access(this.imageUploadPath);
    } catch {
      await fs.mkdir(this.imageUploadPath, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(req.file.originalname);
    const filename = `service-${id}-${timestamp}${extension}`;
    const filepath = path.join(this.imageUploadPath, filename);

    // Save file
    await fs.writeFile(filepath, req.file.buffer);

    // Update service with image URL
    const imageUrl = `/uploads/services/${filename}`;
    const service = await Service.updateById(id, { image_url: imageUrl });

    if (!service) {
      // Clean up uploaded file if service not found
      try {
        await fs.unlink(filepath);
      } catch {}
      return this.notFound(res, 'Service');
    }

    return this.success(
      res,
      {
        service,
        image_url: imageUrl,
      },
      'Service image uploaded successfully'
    );
  });

  /**
   * Bulk update service status
   */
  bulkUpdateStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { service_ids, is_active } = req.body;

    if (!Array.isArray(service_ids) || service_ids.length === 0) {
      throw new AppError('service_ids must be a non-empty array', 400);
    }

    if (typeof is_active !== 'boolean') {
      throw new AppError('is_active must be a boolean', 400);
    }

    const success = await Service.bulkUpdateStatus(service_ids, is_active);

    if (!success) {
      throw new AppError('Failed to update services', 500);
    }

    return this.success(
      res,
      {
        updated_count: service_ids.length,
        is_active,
      },
      'Services status updated successfully'
    );
  });

  /**
   * Get service statistics
   */
  getServiceStatistics = this.asyncHandler(async (_req: Request, res: Response) => {
    const statistics = await Service.getStatistics();

    return this.success(res, statistics, 'Service statistics retrieved successfully');
  });

  /**
   * Get services by category
   */
  getServicesByCategory = this.asyncHandler(async (req: Request, res: Response) => {
    const categoryId = this.parseId(req, 'categoryId');
    const pagination = this.getPagination(req);

    // Verify category exists
    const category = await ServiceCategory.findById(categoryId);
    if (!category) {
      return this.notFound(res, 'Service category');
    }

    const services = await Service.findByCategory(categoryId, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `s.${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count
    const total = await Service.count({ category_id: categoryId, is_active: true });

    return this.paginated(
      res,
      services,
      total,
      pagination,
      'Services by category retrieved successfully'
    );
  });
}
