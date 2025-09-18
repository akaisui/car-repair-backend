import BaseModel from './BaseModel';
import { QueryOptions } from '../types';

export interface PartData {
  id?: number;
  part_code: string;
  name: string;
  description?: string;
  brand?: string;
  unit: string;
  purchase_price?: number;
  selling_price?: number;
  quantity_in_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  location?: string;
  image_url?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface PartSearchFilters {
  search?: string;
  brand?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  in_stock?: boolean;
  low_stock?: boolean;
  out_of_stock?: boolean;
  location?: string;
}

export interface StockMovement {
  id?: number;
  part_id: number;
  movement_type: 'in' | 'out' | 'adjustment' | 'loss' | 'return';
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reference_type?: string;
  reference_id?: number;
  notes?: string;
  performed_by: number;
  created_at?: Date;
}

export interface InventoryAlert {
  id?: number;
  part_id: number;
  alert_type: 'low_stock' | 'out_of_stock' | 'overstock' | 'expiring';
  message: string;
  is_acknowledged: boolean;
  acknowledged_by?: number;
  acknowledged_at?: Date;
  created_at?: Date;
}

/**
 * Part Model
 * Manages automotive parts inventory and stock operations
 */
export default class Part extends BaseModel {
  protected static tableName = 'parts';
  protected static primaryKey = 'id';

  /**
   * Create a new part
   */
  static async create(data: Omit<PartData, 'id' | 'created_at' | 'updated_at'>): Promise<PartData> {
    return await super.create(data);
  }

  /**
   * Update part by ID
   */
  static async updateById(id: number, data: Partial<PartData>): Promise<PartData | null> {
    return await super.updateById(id, data);
  }

  /**
   * Find part by part code
   */
  static async findByPartCode(partCode: string): Promise<PartData | null> {
    return await super.findOne({ part_code: partCode });
  }

  /**
   * Search parts with filters
   */
  static async search(filters: PartSearchFilters, options: QueryOptions = {}): Promise<PartData[]> {
    let query = `
      SELECT p.*
      FROM ${this.tableName} p
      WHERE p.is_active = true
    `;
    const params: any[] = [];

    // Text search in name, description, part_code, brand
    if (filters.search) {
      query += ` AND (
        p.name LIKE ? OR
        p.description LIKE ? OR
        p.part_code LIKE ? OR
        p.brand LIKE ?
      )`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Brand filter
    if (filters.brand) {
      query += ` AND p.brand LIKE ?`;
      params.push(`%${filters.brand}%`);
    }

    // Price range filter
    if (filters.price_min !== undefined) {
      query += ` AND p.selling_price >= ?`;
      params.push(filters.price_min);
    }

    if (filters.price_max !== undefined) {
      query += ` AND p.selling_price <= ?`;
      params.push(filters.price_max);
    }

    // Stock filters
    if (filters.in_stock) {
      query += ` AND p.quantity_in_stock > 0`;
    }

    if (filters.low_stock) {
      query += ` AND p.quantity_in_stock <= p.min_stock_level AND p.quantity_in_stock > 0`;
    }

    if (filters.out_of_stock) {
      query += ` AND p.quantity_in_stock = 0`;
    }

    // Location filter
    if (filters.location) {
      query += ` AND p.location LIKE ?`;
      params.push(`%${filters.location}%`);
    }

    // Add ordering
    query += ` ORDER BY ${options.orderBy || 'p.name ASC'}`;

    // Add pagination
    if (options.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return await this.query(query, params);
  }

  /**
   * Get parts with low stock (below minimum level)
   */
  static async findLowStock(): Promise<PartData[]> {
    return await this.query(`
      SELECT *
      FROM ${this.tableName}
      WHERE is_active = true
        AND quantity_in_stock <= min_stock_level
        AND quantity_in_stock > 0
      ORDER BY (quantity_in_stock / min_stock_level) ASC
    `);
  }

  /**
   * Get out of stock parts
   */
  static async findOutOfStock(): Promise<PartData[]> {
    return await super.findAll({
      where: { quantity_in_stock: 0, is_active: true },
      orderBy: 'name ASC'
    });
  }

  /**
   * Get overstocked parts (above maximum level)
   */
  static async findOverstocked(): Promise<PartData[]> {
    return await this.query(`
      SELECT *
      FROM ${this.tableName}
      WHERE is_active = true
        AND quantity_in_stock > max_stock_level
      ORDER BY (quantity_in_stock / max_stock_level) DESC
    `);
  }

  /**
   * Find parts compatible with specific vehicle
   */
  static async findByVehicle(brand?: string, _model?: string, _year?: number): Promise<PartData[]> {
    // This is a simplified implementation
    // In a real system, you'd have a parts_compatibility table
    let query = `
      SELECT p.*
      FROM ${this.tableName} p
      WHERE p.is_active = true
        AND p.quantity_in_stock > 0
    `;
    const params: any[] = [];

    // Generic search by brand compatibility
    if (brand) {
      query += ` AND (p.description LIKE ? OR p.name LIKE ? OR p.brand = ?)`;
      const brandTerm = `%${brand}%`;
      params.push(brandTerm, brandTerm, brand);
    }

    query += ` ORDER BY p.name ASC`;

    return await this.query(query, params);
  }

  /**
   * Update stock quantity (with movement tracking)
   */
  static async updateStock(
    partId: number,
    newQuantity: number,
    movementType: StockMovement['movement_type'],
    performedBy: number,
    notes?: string,
    unitCost?: number,
    referenceType?: string,
    referenceId?: number
  ): Promise<boolean> {
    const connection = await this.getTransaction();

    try {
      // Get current part data
      const part = await this.findById(partId);
      if (!part) {
        throw new Error('Part not found');
      }

      const quantityDiff = newQuantity - part.quantity_in_stock;

      // Update part quantity
      await connection.execute(
        `UPDATE ${this.tableName} SET quantity_in_stock = ?, updated_at = ? WHERE id = ?`,
        [newQuantity, new Date(), partId]
      );

      // Record stock movement
      const totalCost = unitCost ? Math.abs(quantityDiff) * unitCost : null;

      await connection.execute(`
        INSERT INTO stock_movements (
          part_id, movement_type, quantity, unit_cost, total_cost,
          reference_type, reference_id, notes, performed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        partId,
        movementType,
        quantityDiff,
        unitCost || null,
        totalCost,
        referenceType || null,
        referenceId || null,
        notes || null,
        performedBy,
        new Date()
      ]);

      // Check and create alerts if needed
      await this.checkAndCreateStockAlerts(partId, newQuantity, connection);

      await this.commitTransaction(connection);
      return true;
    } catch (error) {
      await this.rollbackTransaction(connection);
      throw error;
    }
  }

  /**
   * Add stock (stock in)
   */
  static async addStock(
    partId: number,
    quantity: number,
    unitCost: number,
    performedBy: number,
    notes?: string,
    referenceType?: string,
    referenceId?: number
  ): Promise<boolean> {
    const part = await this.findById(partId);
    if (!part) return false;

    const newQuantity = part.quantity_in_stock + quantity;

    return await this.updateStock(
      partId,
      newQuantity,
      'in',
      performedBy,
      notes,
      unitCost,
      referenceType,
      referenceId
    );
  }

  /**
   * Remove stock (stock out)
   */
  static async removeStock(
    partId: number,
    quantity: number,
    performedBy: number,
    notes?: string,
    referenceType?: string,
    referenceId?: number
  ): Promise<boolean> {
    const part = await this.findById(partId);
    if (!part) return false;

    if (part.quantity_in_stock < quantity) {
      throw new Error('Insufficient stock quantity');
    }

    const newQuantity = part.quantity_in_stock - quantity;

    return await this.updateStock(
      partId,
      newQuantity,
      'out',
      performedBy,
      notes,
      undefined,
      referenceType,
      referenceId
    );
  }

  /**
   * Adjust stock (for corrections)
   */
  static async adjustStock(
    partId: number,
    newQuantity: number,
    performedBy: number,
    notes: string
  ): Promise<boolean> {
    return await this.updateStock(
      partId,
      newQuantity,
      'adjustment',
      performedBy,
      notes
    );
  }

  /**
   * Get stock movements for a part
   */
  static async getStockMovements(partId: number, limit?: number): Promise<StockMovement[]> {
    let query = `
      SELECT
        sm.*,
        u.full_name as performed_by_name,
        p.name as part_name,
        p.part_code
      FROM stock_movements sm
      LEFT JOIN users u ON sm.performed_by = u.id
      LEFT JOIN parts p ON sm.part_id = p.id
      WHERE sm.part_id = ?
      ORDER BY sm.created_at DESC
    `;

    const params = [partId];

    if (limit) {
      query += ` LIMIT ?`;
      params.push(limit);
    }

    return await this.query(query, params);
  }

  /**
   * Get inventory alerts
   */
  static async getInventoryAlerts(acknowledged?: boolean): Promise<InventoryAlert[]> {
    let query = `
      SELECT
        ia.*,
        p.name as part_name,
        p.part_code,
        p.quantity_in_stock,
        p.min_stock_level,
        u.full_name as acknowledged_by_name
      FROM inventory_alerts ia
      LEFT JOIN parts p ON ia.part_id = p.id
      LEFT JOIN users u ON ia.acknowledged_by = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (acknowledged !== undefined) {
      query += ` AND ia.is_acknowledged = ?`;
      params.push(acknowledged);
    }

    query += ` ORDER BY ia.created_at DESC`;

    return await this.query(query, params);
  }

  /**
   * Acknowledge inventory alert
   */
  static async acknowledgeAlert(alertId: number, acknowledgedBy: number): Promise<boolean> {
    const result = await this.query(`
      UPDATE inventory_alerts
      SET is_acknowledged = true, acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `, [acknowledgedBy, new Date(), alertId]);

    return result.affectedRows > 0;
  }

  /**
   * Get inventory statistics
   */
  static async getInventoryStatistics(): Promise<{
    total_parts: number;
    total_value: number;
    low_stock_count: number;
    out_of_stock_count: number;
    overstock_count: number;
    brands_count: number;
    locations_count: number;
    recent_movements: StockMovement[];
    top_value_parts: PartData[];
  }> {
    const [
      totalParts,
      totalValue,
      lowStockCount,
      outOfStockCount,
      overstockCount,
      brandsCount,
      locationsCount,
      recentMovements,
      topValueParts
    ] = await Promise.all([
      this.count({ is_active: true }),
      this.query(`
        SELECT SUM(quantity_in_stock * selling_price) as total_value
        FROM ${this.tableName}
        WHERE is_active = true
      `),
      this.query(`
        SELECT COUNT(*) as count
        FROM ${this.tableName}
        WHERE is_active = true AND quantity_in_stock <= min_stock_level AND quantity_in_stock > 0
      `),
      this.count({ quantity_in_stock: 0, is_active: true }),
      this.query(`
        SELECT COUNT(*) as count
        FROM ${this.tableName}
        WHERE is_active = true AND quantity_in_stock > max_stock_level
      `),
      this.query(`
        SELECT COUNT(DISTINCT brand) as count
        FROM ${this.tableName}
        WHERE is_active = true AND brand IS NOT NULL AND brand != ''
      `),
      this.query(`
        SELECT COUNT(DISTINCT location) as count
        FROM ${this.tableName}
        WHERE is_active = true AND location IS NOT NULL AND location != ''
      `),
      this.getRecentStockMovements(10),
      this.query(`
        SELECT *, (quantity_in_stock * selling_price) as total_value
        FROM ${this.tableName}
        WHERE is_active = true AND selling_price > 0
        ORDER BY total_value DESC
        LIMIT 10
      `)
    ]);

    return {
      total_parts: totalParts,
      total_value: totalValue[0]?.total_value || 0,
      low_stock_count: lowStockCount[0]?.count || 0,
      out_of_stock_count: outOfStockCount,
      overstock_count: overstockCount[0]?.count || 0,
      brands_count: brandsCount[0]?.count || 0,
      locations_count: locationsCount[0]?.count || 0,
      recent_movements: recentMovements,
      top_value_parts: topValueParts
    };
  }

  /**
   * Get recent stock movements across all parts
   */
  static async getRecentStockMovements(limit: number = 20): Promise<StockMovement[]> {
    return await this.query(`
      SELECT
        sm.*,
        p.name as part_name,
        p.part_code,
        u.full_name as performed_by_name
      FROM stock_movements sm
      LEFT JOIN parts p ON sm.part_id = p.id
      LEFT JOIN users u ON sm.performed_by = u.id
      ORDER BY sm.created_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get popular parts (most used in repairs)
   */
  static async getPopularParts(limit: number = 10): Promise<PartData[]> {
    return await this.query(`
      SELECT
        p.*,
        COUNT(rp.part_id) as usage_count,
        SUM(rp.quantity) as total_quantity_used
      FROM ${this.tableName} p
      LEFT JOIN repair_parts rp ON p.id = rp.part_id
      WHERE p.is_active = true
      GROUP BY p.id
      ORDER BY usage_count DESC, total_quantity_used DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get parts by brand
   */
  static async getPartsByBrand(brand: string): Promise<PartData[]> {
    return await super.findAll({
      where: { brand, is_active: true },
      orderBy: 'name ASC'
    });
  }

  /**
   * Get all available brands
   */
  static async getAvailableBrands(): Promise<Array<{ brand: string; count: number }>> {
    return await this.query(`
      SELECT brand, COUNT(*) as count
      FROM ${this.tableName}
      WHERE is_active = true AND brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY count DESC, brand ASC
    `);
  }

  /**
   * Get all storage locations
   */
  static async getStorageLocations(): Promise<Array<{ location: string; count: number; total_value: number }>> {
    return await this.query(`
      SELECT
        location,
        COUNT(*) as count,
        SUM(quantity_in_stock * selling_price) as total_value
      FROM ${this.tableName}
      WHERE is_active = true AND location IS NOT NULL AND location != ''
      GROUP BY location
      ORDER BY total_value DESC, location ASC
    `);
  }

  /**
   * Generate part code
   */
  static async generatePartCode(prefix: string = 'PT'): Promise<string> {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const code = `${prefix}${timestamp}${random}`;

    // Check if code already exists
    const existing = await this.findByPartCode(code);
    if (existing) {
      // Recursively generate new code if conflict
      return await this.generatePartCode(prefix);
    }

    return code;
  }

  /**
   * Check and create stock alerts
   */
  private static async checkAndCreateStockAlerts(
    partId: number,
    currentQuantity: number,
    connection?: any
  ): Promise<void> {
    const part = await this.findById(partId);
    if (!part) return;

    const alerts: Omit<InventoryAlert, 'id' | 'created_at'>[] = [];

    // Check for out of stock
    if (currentQuantity === 0) {
      alerts.push({
        part_id: partId,
        alert_type: 'out_of_stock',
        message: `Part ${part.name} (${part.part_code}) is out of stock`,
        is_acknowledged: false
      });
    }
    // Check for low stock
    else if (currentQuantity <= part.min_stock_level) {
      alerts.push({
        part_id: partId,
        alert_type: 'low_stock',
        message: `Part ${part.name} (${part.part_code}) is running low (${currentQuantity} remaining, minimum: ${part.min_stock_level})`,
        is_acknowledged: false
      });
    }

    // Check for overstock
    if (currentQuantity > part.max_stock_level) {
      alerts.push({
        part_id: partId,
        alert_type: 'overstock',
        message: `Part ${part.name} (${part.part_code}) is overstocked (${currentQuantity} in stock, maximum: ${part.max_stock_level})`,
        is_acknowledged: false
      });
    }

    // Insert alerts
    for (const alert of alerts) {
      const insertQuery = `
        INSERT INTO inventory_alerts (part_id, alert_type, message, is_acknowledged, created_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      if (connection) {
        await connection.execute(insertQuery, [
          alert.part_id,
          alert.alert_type,
          alert.message,
          alert.is_acknowledged,
          new Date()
        ]);
      } else {
        await this.query(insertQuery, [
          alert.part_id,
          alert.alert_type,
          alert.message,
          alert.is_acknowledged,
          new Date()
        ]);
      }
    }
  }

  /**
   * Perform stock check and generate alerts for all parts
   */
  static async performStockCheck(): Promise<{
    alerts_created: number;
    low_stock_parts: number;
    out_of_stock_parts: number;
    overstock_parts: number;
  }> {
    const allParts = await this.findAll({ where: { is_active: true } });
    let alertsCreated = 0;
    let lowStockParts = 0;
    let outOfStockParts = 0;
    let overstockParts = 0;

    for (const part of allParts) {
      const beforeAlertCount = (await this.getInventoryAlerts()).length;

      await this.checkAndCreateStockAlerts(part.id!, part.quantity_in_stock);

      const afterAlertCount = (await this.getInventoryAlerts()).length;
      const newAlerts = afterAlertCount - beforeAlertCount;
      alertsCreated += newAlerts;

      // Count different types of issues
      if (part.quantity_in_stock === 0) {
        outOfStockParts++;
      } else if (part.quantity_in_stock <= part.min_stock_level) {
        lowStockParts++;
      }

      if (part.quantity_in_stock > part.max_stock_level) {
        overstockParts++;
      }
    }

    return {
      alerts_created: alertsCreated,
      low_stock_parts: lowStockParts,
      out_of_stock_parts: outOfStockParts,
      overstock_parts: overstockParts
    };
  }
}