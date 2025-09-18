import BaseModel from './BaseModel';
import { QueryOptions } from '../types';

export interface ServiceData {
  id?: number;
  category_id?: number;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price?: number;
  min_price?: number;
  max_price?: number;
  duration_minutes?: number;
  image_url?: string;
  is_featured?: boolean;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface ServiceSearchFilters {
  category_id?: number;
  price_min?: number;
  price_max?: number;
  duration_min?: number;
  duration_max?: number;
  is_featured?: boolean;
  is_active?: boolean;
  search?: string;
}

/**
 * Service Model
 * Manages automotive repair services
 */
export default class Service extends BaseModel {
  protected static tableName = 'services';
  protected static primaryKey = 'id';

  /**
   * Create a new service
   */
  static async create(data: Omit<ServiceData, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceData> {
    return await super.create(data);
  }

  /**
   * Update service by ID
   */
  static async updateById(id: number, data: Partial<ServiceData>): Promise<ServiceData | null> {
    return await super.updateById(id, data);
  }

  /**
   * Find service by slug
   */
  static async findBySlug(slug: string): Promise<ServiceData | null> {
    return await super.findOne({ slug });
  }

  /**
   * Find services by category
   */
  static async findByCategory(categoryId: number, options: QueryOptions = {}): Promise<ServiceData[]> {
    let query = `
      SELECT s.*, sc.name as category_name
      FROM ${this.tableName} s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE s.category_id = ? AND s.is_active = ?
    `;

    const params: any[] = [categoryId, 1]; // Convert boolean to integer

    // Add additional WHERE conditions if provided
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.keys(options.where).map(key => {
        params.push(options.where![key]);
        return `s.${key} = ?`;
      });
      query += ` AND ${conditions.join(' AND ')}`;
    }

    // Add ORDER BY
    query += ` ORDER BY ${options.orderBy || 's.created_at DESC'}`;

    // Add LIMIT and OFFSET
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    return await this.query(query, params);
  }

  /**
   * Find featured services
   */
  static async findFeatured(limit?: number): Promise<ServiceData[]> {
    let query = `
      SELECT
        s.*,
        sc.name as category_name,
        sc.slug as category_slug
      FROM ${this.tableName} s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE s.is_featured = 1 AND s.is_active = 1
      ORDER BY s.created_at DESC
    `;

    if (limit && limit > 0) {
      query += ` LIMIT ${limit}`;
    }

    return await this.query(query, []);
  }

  /**
   * Find active services
   */
  static async findActive(options: QueryOptions = {}): Promise<ServiceData[]> {
    // Build query step by step to identify the issue
    const baseQuery = `SELECT s.*, sc.name as category_name FROM ${this.tableName} s LEFT JOIN service_categories sc ON s.category_id = sc.id WHERE s.is_active = 1`;

    // For now, use a simple query without parameter binding to test
    let query = baseQuery;

    // Add ORDER BY
    const orderBy = options.orderBy || 's.created_at DESC';
    query += ` ORDER BY ${orderBy}`;

    // Add LIMIT directly in query instead of parameter binding
    const limit = options.limit || 50;
    query += ` LIMIT ${limit}`;

    if (options.offset && options.offset > 0) {
      query += ` OFFSET ${options.offset}`;
    }

    console.log('DEBUG findActive query:', query);

    try {
      // Use query without parameters for now
      return await this.query(query, []);
    } catch (error) {
      console.error('Query execution failed:', error);
      console.error('Failed query:', query);
      throw error;
    }
  }

  /**
   * Search services with filters
   */
  static async search(filters: ServiceSearchFilters, options: QueryOptions = {}): Promise<ServiceData[]> {
    let query = `
      SELECT s.*, sc.name as category_name
      FROM ${this.tableName} s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE s.is_active = ?
    `;
    const params: any[] = [1]; // Convert boolean to integer

    // Category filter
    if (filters.category_id) {
      query += ` AND s.category_id = ?`;
      params.push(filters.category_id);
    }

    // Price range filter
    if (filters.price_min !== undefined) {
      query += ` AND (s.price >= ? OR s.min_price >= ?)`;
      params.push(filters.price_min, filters.price_min);
    }

    if (filters.price_max !== undefined) {
      query += ` AND (s.price <= ? OR s.max_price <= ?)`;
      params.push(filters.price_max, filters.price_max);
    }

    // Duration filter
    if (filters.duration_min !== undefined) {
      query += ` AND s.duration_minutes >= ?`;
      params.push(filters.duration_min);
    }

    if (filters.duration_max !== undefined) {
      query += ` AND s.duration_minutes <= ?`;
      params.push(filters.duration_max);
    }

    // Featured filter
    if (filters.is_featured !== undefined) {
      query += ` AND s.is_featured = ?`;
      params.push(filters.is_featured);
    }

    // Text search
    if (filters.search) {
      query += ` AND (s.name LIKE ? OR s.description LIKE ? OR s.short_description LIKE ?)`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Add ordering
    query += ` ORDER BY ${options.orderBy || 'is_featured DESC, s.created_at DESC'}`;

    // Add pagination
    if (options.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);

      if (options.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    console.log('DEBUG findActive query:', query);
    console.log('DEBUG findActive params:', params);
    return await this.query(query, params);
  }

  /**
   * Get services with pricing information
   */
  static async findWithPricing(options: QueryOptions = {}): Promise<ServiceData[]> {
    // Simplified query to test - ignoring options for now
    console.log('DEBUG options:', options);
    const query = `SELECT s.*, sc.name as category_name FROM services s LEFT JOIN service_categories sc ON s.category_id = sc.id WHERE s.is_active = 1 ORDER BY s.created_at DESC LIMIT 50`;

    console.log('DEBUG findWithPricing query:', query);
    console.log('DEBUG findWithPricing params:', []);
    return await this.query(query, []);
  }

  /**
   * Get services by classification (basic, advanced, special)
   * Based on service categories and naming conventions
   */
  static async findByClassification(classification: 'basic' | 'advanced' | 'special'): Promise<ServiceData[]> {
    let query = `
      SELECT s.*, sc.name as category_name
      FROM ${this.tableName} s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE s.is_active = ?
    `;

    const params: any[] = [1];

    switch (classification) {
      case 'basic':
        // Basic services: maintenance, oil change, tire repair, etc.
        query += ` AND (
          s.name LIKE '%thay nhớt%' OR
          s.name LIKE '%lọc gió%' OR
          s.name LIKE '%thay lốp%' OR
          s.name LIKE '%vá lốp%' OR
          s.name LIKE '%bảo dưỡng%' OR
          s.name LIKE '%kiểm tra%' OR
          sc.slug LIKE '%co-ban%' OR
          sc.slug LIKE '%bao-duong%'
        )`;
        break;

      case 'advanced':
        // Advanced services: engine overhaul, transmission repair, etc.
        query += ` AND (
          s.name LIKE '%đại tu%' OR
          s.name LIKE '%hộp số%' OR
          s.name LIKE '%ly hợp%' OR
          s.name LIKE '%sơn xe%' OR
          s.name LIKE '%độ xe%' OR
          s.name LIKE '%lắp đặt%' OR
          sc.slug LIKE '%chuyen-sau%' OR
          sc.slug LIKE '%dai-tu%'
        )`;
        break;

      case 'special':
        // Special services: 24/7 rescue, home service, etc.
        query += ` AND (
          s.name LIKE '%cứu hộ%' OR
          s.name LIKE '%24/7%' OR
          s.name LIKE '%tại nhà%' OR
          s.name LIKE '%rửa xe%' OR
          s.name LIKE '%vệ sinh%' OR
          s.name LIKE '%kiểm tra xe%' OR
          sc.slug LIKE '%dac-biet%' OR
          sc.slug LIKE '%cuu-ho%'
        )`;
        break;
    }

    query += ` ORDER BY s.is_featured DESC, s.created_at DESC`;

    return await this.query(query, params);
  }

  /**
   * Get popular services based on usage in repairs
   */
  static async findPopular(limit: number = 10): Promise<ServiceData[]> {
    const query = `
      SELECT
        s.*,
        sc.name as category_name,
        COUNT(rs.service_id) as usage_count
      FROM ${this.tableName} s
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      LEFT JOIN repair_services rs ON s.id = rs.service_id
      WHERE s.is_active = ?
      GROUP BY s.id
      ORDER BY usage_count DESC, s.is_featured DESC
      LIMIT ?
    `;

    return await this.query(query, [1, limit]);
  }

  /**
   * Get service statistics
   */
  static async getStatistics(): Promise<{
    total: number;
    active: number;
    featured: number;
    by_category: Array<{ category_name: string; count: number }>;
  }> {
    const [
      totalResult,
      activeResult,
      featuredResult,
      categoryResult
    ] = await Promise.all([
      this.count(),
      this.count({ is_active: true }),
      this.count({ is_active: true, is_featured: true }),
      this.query(`
        SELECT sc.name as category_name, COUNT(s.id) as count
        FROM service_categories sc
        LEFT JOIN services s ON sc.id = s.category_id AND s.is_active = ?
        GROUP BY sc.id, sc.name
        ORDER BY count DESC
      `, [1])
    ]);

    return {
      total: totalResult,
      active: activeResult,
      featured: featuredResult,
      by_category: categoryResult
    };
  }

  /**
   * Toggle featured status
   */
  static async toggleFeatured(id: number): Promise<ServiceData | null> {
    const service = await this.findById(id);
    if (!service) return null;

    return await this.updateById(id, {
      is_featured: !service.is_featured
    });
  }

  /**
   * Update service pricing
   */
  static async updatePricing(id: number, pricing: {
    price?: number;
    min_price?: number;
    max_price?: number;
  }): Promise<ServiceData | null> {
    return await this.updateById(id, pricing);
  }

  /**
   * Bulk update service status
   */
  static async bulkUpdateStatus(ids: number[], isActive: boolean): Promise<boolean> {
    if (ids.length === 0) return false;

    const placeholders = ids.map(() => '?').join(',');
    const query = `
      UPDATE ${this.tableName}
      SET is_active = ?, updated_at = ?
      WHERE id IN (${placeholders})
    `;

    const params = [isActive, new Date(), ...ids];
    const result = await this.query(query, params);

    return result.affectedRows > 0;
  }
}