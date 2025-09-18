import { Request, Response } from 'express';
import BaseController from './BaseController';
import Part, { PartSearchFilters } from '../models/Part';
import { AppError } from '../utils';
import path from 'path';
import fs from 'fs/promises';

/**
 * Part Controller
 * Handles parts inventory management operations
 */
export default class PartController extends BaseController {
  private readonly allowedFields = [
    'part_code',
    'name',
    'description',
    'brand',
    'unit',
    'purchase_price',
    'selling_price',
    'quantity_in_stock',
    'min_stock_level',
    'max_stock_level',
    'location',
    'image_url',
    'is_active'
  ];

  private readonly imageUploadPath = path.join(process.cwd(), 'public', 'uploads', 'parts');

  /**
   * Get all parts with pagination and filters
   */
  getAllParts = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { search, brand, price_min, price_max, in_stock, low_stock, out_of_stock, location } = req.query;

    const filters: PartSearchFilters = {};

    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (price_min) filters.price_min = parseFloat(price_min as string);
    if (price_max) filters.price_max = parseFloat(price_max as string);
    if (in_stock === 'true') filters.in_stock = true;
    if (low_stock === 'true') filters.low_stock = true;
    if (out_of_stock === 'true') filters.out_of_stock = true;
    if (location) filters.location = location as string;

    const parts = await Part.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`
    });

    // Get total count (simplified)
    const total = await Part.count({ is_active: true });

    return this.paginated(res, parts, total, pagination, 'Parts retrieved successfully');
  });

  /**
   * Get part by ID
   */
  getPartById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const part = await Part.findById(id);

    if (!part) {
      return this.notFound(res, 'Part');
    }

    // Get additional part information
    const [stockMovements] = await Promise.all([
      Part.getStockMovements(id, 10)
    ]);

    const partWithDetails = {
      ...part,
      recent_stock_movements: stockMovements
    };

    return this.success(res, partWithDetails, 'Part retrieved successfully');
  });

  /**
   * Get part by part code
   */
  getPartByCode = this.asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const part = await Part.findByPartCode(code);

    if (!part) {
      return this.notFound(res, 'Part');
    }

    return this.success(res, part, 'Part retrieved successfully');
  });

  /**
   * Create new part
   */
  createPart = this.asyncHandler(async (req: Request, res: Response) => {
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate required fields
    this.validateRequired(data, ['name', 'unit', 'quantity_in_stock', 'min_stock_level', 'max_stock_level']);

    // Generate part code if not provided
    if (!data.part_code) {
      data.part_code = await Part.generatePartCode();
    }

    // Check if part code already exists
    const existingPart = await Part.findByPartCode(data.part_code);
    if (existingPart) {
      throw new AppError('Part with this code already exists', 400);
    }

    // Validate stock levels
    if (data.min_stock_level < 0) {
      throw new AppError('Minimum stock level cannot be negative', 400);
    }

    if (data.max_stock_level <= data.min_stock_level) {
      throw new AppError('Maximum stock level must be greater than minimum stock level', 400);
    }

    if (data.quantity_in_stock < 0) {
      throw new AppError('Quantity in stock cannot be negative', 400);
    }

    // Validate prices
    if (data.purchase_price && data.purchase_price < 0) {
      throw new AppError('Purchase price cannot be negative', 400);
    }

    if (data.selling_price && data.selling_price < 0) {
      throw new AppError('Selling price cannot be negative', 400);
    }

    const part = await Part.create(data);

    // Create initial stock movement record if there's initial stock
    if (data.quantity_in_stock > 0) {
      const user = this.getUser(req);
      await Part.addStock(
        part.id!,
        0, // Adding 0 because stock is already set in creation
        data.purchase_price || 0,
        user.id,
        'Initial stock entry',
        'initial_stock',
        part.id
      );
    }

    return this.success(res, part, 'Part created successfully', 201);
  });

  /**
   * Update part
   */
  updatePart = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const data = this.filterFields(req.body, this.allowedFields);

    // Check if part code already exists (excluding current part)
    if (data.part_code) {
      const existingPart = await Part.findByPartCode(data.part_code);
      if (existingPart && existingPart.id !== id) {
        throw new AppError('Part with this code already exists', 400);
      }
    }

    // Validate stock levels if provided
    if (data.min_stock_level !== undefined && data.min_stock_level < 0) {
      throw new AppError('Minimum stock level cannot be negative', 400);
    }

    if (data.max_stock_level !== undefined && data.min_stock_level !== undefined) {
      if (data.max_stock_level <= data.min_stock_level) {
        throw new AppError('Maximum stock level must be greater than minimum stock level', 400);
      }
    }

    // Validate prices
    if (data.purchase_price !== undefined && data.purchase_price < 0) {
      throw new AppError('Purchase price cannot be negative', 400);
    }

    if (data.selling_price !== undefined && data.selling_price < 0) {
      throw new AppError('Selling price cannot be negative', 400);
    }

    const part = await Part.updateById(id, data);

    if (!part) {
      return this.notFound(res, 'Part');
    }

    return this.success(res, part, 'Part updated successfully');
  });

  /**
   * Delete part (soft delete)
   */
  deletePart = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    const success = await Part.softDeleteById(id);

    if (!success) {
      return this.notFound(res, 'Part');
    }

    return this.success(res, null, 'Part deleted successfully');
  });

  /**
   * Search parts
   */
  searchParts = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { search, brand, price_min, price_max, in_stock, low_stock, out_of_stock, location } = req.query;

    const filters: PartSearchFilters = {};

    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (price_min) filters.price_min = parseFloat(price_min as string);
    if (price_max) filters.price_max = parseFloat(price_max as string);
    if (in_stock === 'true') filters.in_stock = true;
    if (low_stock === 'true') filters.low_stock = true;
    if (out_of_stock === 'true') filters.out_of_stock = true;
    if (location) filters.location = location as string;

    const parts = await Part.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`
    });

    const total = parts.length;

    return this.paginated(res, parts, total, pagination, 'Parts searched successfully');
  });

  /**
   * Get parts with low stock
   */
  getLowStockParts = this.asyncHandler(async (_req: Request, res: Response) => {
    const parts = await Part.findLowStock();

    return this.success(res, parts, 'Low stock parts retrieved successfully');
  });

  /**
   * Get out of stock parts
   */
  getOutOfStockParts = this.asyncHandler(async (_req: Request, res: Response) => {
    const parts = await Part.findOutOfStock();

    return this.success(res, parts, 'Out of stock parts retrieved successfully');
  });

  /**
   * Get overstocked parts
   */
  getOverstockedParts = this.asyncHandler(async (_req: Request, res: Response) => {
    const parts = await Part.findOverstocked();

    return this.success(res, parts, 'Overstocked parts retrieved successfully');
  });

  /**
   * Add stock to part
   */
  addStock = this.asyncHandler(async (req: Request, res: Response) => {
    const partId = this.parseId(req, 'partId');
    const { quantity, unit_cost, notes, reference_type, reference_id } = req.body;

    if (!quantity || quantity <= 0) {
      throw new AppError('Quantity must be a positive number', 400);
    }

    if (!unit_cost || unit_cost < 0) {
      throw new AppError('Unit cost must be a positive number', 400);
    }

    const user = this.getUser(req);

    const success = await Part.addStock(
      partId,
      quantity,
      unit_cost,
      user.id,
      notes,
      reference_type,
      reference_id
    );

    if (!success) {
      return this.notFound(res, 'Part');
    }

    // Get updated part info
    const part = await Part.findById(partId);

    return this.success(res, {
      part,
      quantity_added: quantity,
      unit_cost,
      total_cost: quantity * unit_cost
    }, 'Stock added successfully');
  });

  /**
   * Remove stock from part
   */
  removeStock = this.asyncHandler(async (req: Request, res: Response) => {
    const partId = this.parseId(req, 'partId');
    const { quantity, notes, reference_type, reference_id } = req.body;

    if (!quantity || quantity <= 0) {
      throw new AppError('Quantity must be a positive number', 400);
    }

    const user = this.getUser(req);

    try {
      const success = await Part.removeStock(
        partId,
        quantity,
        user.id,
        notes,
        reference_type,
        reference_id
      );

      if (!success) {
        return this.notFound(res, 'Part');
      }

      // Get updated part info
      const part = await Part.findById(partId);

      return this.success(res, {
        part,
        quantity_removed: quantity
      }, 'Stock removed successfully');

    } catch (error: any) {
      if (error.message === 'Insufficient stock quantity') {
        throw new AppError('Insufficient stock quantity', 400);
      }
      throw error;
    }
  });

  /**
   * Adjust stock (for corrections)
   */
  adjustStock = this.asyncHandler(async (req: Request, res: Response) => {
    const partId = this.parseId(req, 'partId');
    const { new_quantity, reason } = req.body;

    if (new_quantity === undefined || new_quantity < 0) {
      throw new AppError('New quantity must be a non-negative number', 400);
    }

    if (!reason) {
      throw new AppError('Reason for adjustment is required', 400);
    }

    const user = this.getUser(req);

    const success = await Part.adjustStock(partId, new_quantity, user.id, reason);

    if (!success) {
      return this.notFound(res, 'Part');
    }

    // Get updated part info
    const part = await Part.findById(partId);

    return this.success(res, {
      part,
      new_quantity,
      reason
    }, 'Stock adjusted successfully');
  });

  /**
   * Get stock movements for a part
   */
  getStockMovements = this.asyncHandler(async (req: Request, res: Response) => {
    const partId = this.parseId(req, 'partId');
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    // Verify part exists
    const part = await Part.findById(partId);
    if (!part) {
      return this.notFound(res, 'Part');
    }

    const movements = await Part.getStockMovements(partId, limit);

    return this.success(res, movements, 'Stock movements retrieved successfully');
  });

  /**
   * Get inventory alerts
   */
  getInventoryAlerts = this.asyncHandler(async (req: Request, res: Response) => {
    const acknowledged = req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : undefined;

    const alerts = await Part.getInventoryAlerts(acknowledged);

    return this.success(res, alerts, 'Inventory alerts retrieved successfully');
  });

  /**
   * Acknowledge inventory alert
   */
  acknowledgeAlert = this.asyncHandler(async (req: Request, res: Response) => {
    const alertId = this.parseId(req, 'alertId');
    const user = this.getUser(req);

    const success = await Part.acknowledgeAlert(alertId, user.id);

    if (!success) {
      return this.notFound(res, 'Alert');
    }

    return this.success(res, null, 'Alert acknowledged successfully');
  });

  /**
   * Find parts by vehicle compatibility
   */
  findPartsByVehicle = this.asyncHandler(async (req: Request, res: Response) => {
    const { brand, model, year } = req.query;

    const parts = await Part.findByVehicle(
      brand as string,
      model as string,
      year ? parseInt(year as string) : undefined
    );

    return this.success(res, parts, `Parts for ${brand} ${model} ${year || ''} retrieved successfully`.trim());
  });

  /**
   * Get inventory statistics
   */
  getInventoryStatistics = this.asyncHandler(async (_req: Request, res: Response) => {
    const statistics = await Part.getInventoryStatistics();

    return this.success(res, statistics, 'Inventory statistics retrieved successfully');
  });

  /**
   * Get recent stock movements
   */
  getRecentStockMovements = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const movements = await Part.getRecentStockMovements(limit);

    return this.success(res, movements, 'Recent stock movements retrieved successfully');
  });

  /**
   * Get popular parts
   */
  getPopularParts = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const parts = await Part.getPopularParts(limit);

    return this.success(res, parts, 'Popular parts retrieved successfully');
  });

  /**
   * Get parts by brand
   */
  getPartsByBrand = this.asyncHandler(async (req: Request, res: Response) => {
    const { brand } = req.params;

    const parts = await Part.getPartsByBrand(brand);

    return this.success(res, parts, `Parts by brand ${brand} retrieved successfully`);
  });

  /**
   * Get available brands
   */
  getAvailableBrands = this.asyncHandler(async (_req: Request, res: Response) => {
    const brands = await Part.getAvailableBrands();

    return this.success(res, brands, 'Available brands retrieved successfully');
  });

  /**
   * Get storage locations
   */
  getStorageLocations = this.asyncHandler(async (_req: Request, res: Response) => {
    const locations = await Part.getStorageLocations();

    return this.success(res, locations, 'Storage locations retrieved successfully');
  });

  /**
   * Upload part image
   */
  uploadPartImage = this.asyncHandler(async (req: Request, res: Response) => {
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
    const filename = `part-${id}-${timestamp}${extension}`;
    const filepath = path.join(this.imageUploadPath, filename);

    // Save file
    await fs.writeFile(filepath, req.file.buffer);

    // Update part with image URL
    const imageUrl = `/uploads/parts/${filename}`;
    const part = await Part.updateById(id, { image_url: imageUrl });

    if (!part) {
      // Clean up uploaded file if part not found
      try {
        await fs.unlink(filepath);
      } catch {}
      return this.notFound(res, 'Part');
    }

    return this.success(res, {
      part,
      image_url: imageUrl
    }, 'Part image uploaded successfully');
  });

  /**
   * Perform stock check and generate alerts
   */
  performStockCheck = this.asyncHandler(async (_req: Request, res: Response) => {
    const result = await Part.performStockCheck();

    return this.success(res, result, 'Stock check completed successfully');
  });

  /**
   * Generate part code
   */
  generatePartCode = this.asyncHandler(async (req: Request, res: Response) => {
    const { prefix } = req.query;

    const partCode = await Part.generatePartCode(prefix as string);

    return this.success(res, { part_code: partCode }, 'Part code generated successfully');
  });

  /**
   * Export parts inventory
   */
  exportParts = this.asyncHandler(async (req: Request, res: Response) => {
    const { format = 'csv', search, brand, in_stock, low_stock, out_of_stock } = req.query;

    if (format !== 'csv' && format !== 'json') {
      throw new AppError('Invalid format. Supported formats: csv, json', 400);
    }

    const filters: PartSearchFilters = {};
    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (in_stock === 'true') filters.in_stock = true;
    if (low_stock === 'true') filters.low_stock = true;
    if (out_of_stock === 'true') filters.out_of_stock = true;

    const parts = await Part.search(filters, {
      orderBy: 'name ASC'
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="parts_inventory.json"');
      return res.send(JSON.stringify(parts, null, 2));
    }

    // CSV format
    const csvHeader = [
      'ID',
      'Part Code',
      'Name',
      'Description',
      'Brand',
      'Unit',
      'Purchase Price',
      'Selling Price',
      'Quantity in Stock',
      'Min Stock Level',
      'Max Stock Level',
      'Location',
      'Stock Status',
      'Total Value',
      'Created At'
    ].join(',');

    const csvRows = parts.map(part => [
      part.id,
      `"${part.part_code || ''}"`,
      `"${part.name || ''}"`,
      `"${(part.description || '').replace(/"/g, '""')}"`,
      `"${part.brand || ''}"`,
      `"${part.unit || ''}"`,
      part.purchase_price || 0,
      part.selling_price || 0,
      part.quantity_in_stock || 0,
      part.min_stock_level || 0,
      part.max_stock_level || 0,
      `"${part.location || ''}"`,
      `"${this.getStockStatus(part)}"`,
      ((part.quantity_in_stock || 0) * (part.selling_price || 0)),
      `"${part.created_at || ''}"`
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="parts_inventory.csv"');
    return res.send('\ufeff' + csvContent); // BOM for UTF-8
  });

  /**
   * Get stock status for a part
   */
  private getStockStatus(part: any): string {
    if (part.quantity_in_stock === 0) return 'Out of Stock';
    if (part.quantity_in_stock <= part.min_stock_level) return 'Low Stock';
    if (part.quantity_in_stock > part.max_stock_level) return 'Overstock';
    return 'In Stock';
  }
}