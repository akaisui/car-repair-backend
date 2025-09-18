import { Request, Response } from 'express';
import BaseController from './BaseController';
import ServiceCategory from '../models/ServiceCategory';
import { AppError } from '../utils';

/**
 * ServiceCategory Controller
 * Handles service category management operations
 */
export default class ServiceCategoryController extends BaseController {
  private readonly allowedFields = [
    'name',
    'slug',
    'description',
    'icon',
    'sort_order',
    'is_active',
  ];

  /**
   * Get all service categories with pagination
   */
  getAllCategories = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { is_active } = req.query;

    let filters: any = {};
    if (is_active !== undefined) filters.is_active = is_active === 'true';

    const { data, total } = await ServiceCategory.findPaginated(pagination, { where: filters });

    return this.paginated(
      res,
      data,
      total,
      pagination,
      'Service categories retrieved successfully'
    );
  });

  /**
   * Get active service categories ordered by sort_order
   */
  getActiveCategories = this.asyncHandler(async (_req: Request, res: Response) => {
    const categories = await ServiceCategory.findActive();

    return this.success(res, categories, 'Active service categories retrieved successfully');
  });

  /**
   * Get service categories with service count
   */
  getCategoriesWithServiceCount = this.asyncHandler(async (_req: Request, res: Response) => {
    const categories = await ServiceCategory.findWithServiceCount();

    return this.success(
      res,
      categories,
      'Service categories with service count retrieved successfully'
    );
  });

  /**
   * Get service category by ID
   */
  getCategoryById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const category = await ServiceCategory.findById(id);

    if (!category) {
      return this.notFound(res, 'Service category');
    }

    return this.success(res, category, 'Service category retrieved successfully');
  });

  /**
   * Get service category by slug
   */
  getCategoryBySlug = this.asyncHandler(async (req: Request, res: Response) => {
    const { slug } = req.params;
    const category = await ServiceCategory.findBySlug(slug);

    if (!category) {
      return this.notFound(res, 'Service category');
    }

    return this.success(res, category, 'Service category retrieved successfully');
  });

  /**
   * Create new service category
   */
  createCategory = this.asyncHandler(async (req: Request, res: Response) => {
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate required fields
    this.validateRequired(data, ['name', 'slug']);

    // Check if slug already exists
    const existingCategory = await ServiceCategory.findBySlug(data.slug);
    if (existingCategory) {
      throw new AppError('Service category with this slug already exists', 400);
    }

    // Set sort_order if not provided
    if (!data.sort_order) {
      data.sort_order = await ServiceCategory.getNextSortOrder();
    }

    const category = await ServiceCategory.create(data);
    return this.success(res, category, 'Service category created successfully', 201);
  });

  /**
   * Update service category
   */
  updateCategory = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const data = this.filterFields(req.body, this.allowedFields);

    // Check if slug already exists (excluding current category)
    if (data.slug) {
      const existingCategory = await ServiceCategory.findBySlug(data.slug);
      if (existingCategory && existingCategory.id !== id) {
        throw new AppError('Service category with this slug already exists', 400);
      }
    }

    const category = await ServiceCategory.updateById(id, data);

    if (!category) {
      return this.notFound(res, 'Service category');
    }

    return this.success(res, category, 'Service category updated successfully');
  });

  /**
   * Delete service category (soft delete)
   */
  deleteCategory = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    const success = await ServiceCategory.softDeleteById(id);

    if (!success) {
      return this.notFound(res, 'Service category');
    }

    return this.success(res, null, 'Service category deleted successfully');
  });

  /**
   * Get categories by classification
   */
  getCategoriesByClassification = this.asyncHandler(async (req: Request, res: Response) => {
    const { classification } = req.params;

    if (!['basic', 'advanced', 'special'].includes(classification)) {
      throw new AppError('Invalid classification. Must be: basic, advanced, or special', 400);
    }

    const categories = await ServiceCategory.findByClassification(
      classification as 'basic' | 'advanced' | 'special'
    );

    return this.success(
      res,
      categories,
      `${classification} service categories retrieved successfully`
    );
  });

  /**
   * Update sort order for multiple categories
   */
  updateSortOrder = this.asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('updates must be a non-empty array', 400);
    }

    // Validate updates format
    for (const update of updates) {
      if (!update.id || typeof update.sort_order !== 'number') {
        throw new AppError('Each update must have id and sort_order', 400);
      }
    }

    const success = await ServiceCategory.updateSortOrder(updates);

    if (!success) {
      throw new AppError('Failed to update sort order', 500);
    }

    return this.success(res, { updated_count: updates.length }, 'Sort order updated successfully');
  });

  /**
   * Reorder categories
   */
  reorderCategories = this.asyncHandler(async (req: Request, res: Response) => {
    const { category_ids } = req.body;

    if (!Array.isArray(category_ids) || category_ids.length === 0) {
      throw new AppError('category_ids must be a non-empty array', 400);
    }

    const success = await ServiceCategory.reorder(category_ids);

    if (!success) {
      throw new AppError('Failed to reorder categories', 500);
    }

    return this.success(
      res,
      { reordered_count: category_ids.length },
      'Categories reordered successfully'
    );
  });

  /**
   * Toggle category active status
   */
  toggleActive = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    const category = await ServiceCategory.toggleActive(id);

    if (!category) {
      return this.notFound(res, 'Service category');
    }

    return this.success(
      res,
      category,
      `Service category ${category.is_active ? 'activated' : 'deactivated'} successfully`
    );
  });

  /**
   * Get category statistics
   */
  getCategoryStatistics = this.asyncHandler(async (_req: Request, res: Response) => {
    const statistics = await ServiceCategory.getStatistics();

    return this.success(res, statistics, 'Service category statistics retrieved successfully');
  });

  /**
   * Initialize default categories
   */
  initializeDefaultCategories = this.asyncHandler(async (req: Request, res: Response) => {
    // Check if user has admin role
    const user = this.getUser(req);
    if (user.role !== 'admin') {
      return this.forbidden(res, 'Only admins can initialize default categories');
    }

    const createdCategories = await ServiceCategory.initializeDefaultCategories();

    return this.success(
      res,
      {
        created_categories: createdCategories,
        created_count: createdCategories.length,
      },
      'Default service categories initialized successfully'
    );
  });

  /**
   * Get predefined categories (for reference)
   */
  getPredefinedCategories = this.asyncHandler(async (_req: Request, res: Response) => {
    const predefinedCategories = ServiceCategory.getPredefinedCategories();

    return this.success(
      res,
      predefinedCategories,
      'Predefined service categories retrieved successfully'
    );
  });

  /**
   * Get next available sort order
   */
  getNextSortOrder = this.asyncHandler(async (_req: Request, res: Response) => {
    const nextSortOrder = await ServiceCategory.getNextSortOrder();

    return this.success(
      res,
      { next_sort_order: nextSortOrder },
      'Next sort order retrieved successfully'
    );
  });
}
