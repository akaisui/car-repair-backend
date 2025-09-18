import BaseModel from './BaseModel';
import { QueryOptions } from '../types';

export interface VehicleData {
  id?: number;
  user_id?: number;
  license_plate: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string;
  engine_number?: string;
  chassis_number?: string;
  mileage?: number;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
  // Joined fields
  customer_name?: string;
  customer_phone?: string;
}

export interface VehicleSearchFilters {
  search?: string;
  brand?: string;
  year_from?: number;
  year_to?: number;
  user_id?: number;
}

/**
 * Vehicle Model
 * Manages vehicle information for customers
 */
export default class Vehicle extends BaseModel {
  protected static tableName = 'vehicles';
  protected static primaryKey = 'id';

  /**
   * Create a new vehicle
   */
  static async create(data: Omit<VehicleData, 'id' | 'created_at' | 'updated_at'>): Promise<VehicleData> {
    // Normalize license plate
    if (data.license_plate) {
      data.license_plate = data.license_plate.toUpperCase().replace(/\s+/g, '');
    }

    return await super.create(data);
  }

  /**
   * Update vehicle by ID
   */
  static async updateById(id: number, data: Partial<VehicleData>): Promise<VehicleData | null> {
    // Normalize license plate if provided
    if (data.license_plate) {
      data.license_plate = data.license_plate.toUpperCase().replace(/\s+/g, '');
    }

    return await super.updateById(id, data);
  }

  /**
   * Find vehicle by license plate
   */
  static async findByLicensePlate(licensePlate: string): Promise<VehicleData | null> {
    const normalizedPlate = licensePlate.toUpperCase().replace(/\s+/g, '');
    return await super.findOne({ license_plate: normalizedPlate });
  }

  /**
   * Find vehicles by user ID
   */
  static async findByUserId(userId: number): Promise<VehicleData[]> {
    return await super.findAll({
      where: { user_id: userId },
      orderBy: 'created_at DESC'
    });
  }

  /**
   * Find vehicles with customer information
   */
  static async findWithCustomerInfo(options: QueryOptions = {}): Promise<VehicleData[]> {
    let query = `
      SELECT
        v.*,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.customer_code
      FROM ${this.tableName} v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Add WHERE conditions
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.keys(options.where).map(key => {
        params.push(options.where![key]);
        return `v.${key} = ?`;
      });
      query += ` AND ${conditions.join(' AND ')}`;
    }

    // Add ordering
    query += ` ORDER BY ${options.orderBy || 'v.created_at DESC'}`;

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
   * Search vehicles with filters
   */
  static async search(filters: VehicleSearchFilters, options: QueryOptions = {}): Promise<VehicleData[]> {
    let query = `
      SELECT
        v.*,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.customer_code
      FROM ${this.tableName} v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Text search in license plate, brand, model, customer name
    if (filters.search) {
      query += ` AND (
        v.license_plate LIKE ? OR
        v.brand LIKE ? OR
        v.model LIKE ? OR
        u.full_name LIKE ? OR
        v.engine_number LIKE ? OR
        v.chassis_number LIKE ?
      )`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Brand filter
    if (filters.brand) {
      query += ` AND v.brand LIKE ?`;
      params.push(`%${filters.brand}%`);
    }

    // Year range filter
    if (filters.year_from) {
      query += ` AND v.year >= ?`;
      params.push(filters.year_from);
    }

    if (filters.year_to) {
      query += ` AND v.year <= ?`;
      params.push(filters.year_to);
    }

    // User filter
    if (filters.user_id) {
      query += ` AND v.user_id = ?`;
      params.push(filters.user_id);
    }

    // Add ordering
    query += ` ORDER BY ${options.orderBy || 'v.created_at DESC'}`;

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
   * Get vehicle statistics
   */
  static async getStatistics(): Promise<{
    total: number;
    by_brand: Array<{ brand: string; count: number }>;
    by_year: Array<{ year: number; count: number }>;
    recent_vehicles: VehicleData[];
    needs_maintenance: VehicleData[];
  }> {
    const [
      totalResult,
      byBrandResult,
      byYearResult,
      recentResult,
      maintenanceResult
    ] = await Promise.all([
      this.count(),
      this.query(`
        SELECT brand, COUNT(*) as count
        FROM ${this.tableName}
        WHERE brand IS NOT NULL AND brand != ''
        GROUP BY brand
        ORDER BY count DESC
        LIMIT 10
      `),
      this.query(`
        SELECT year, COUNT(*) as count
        FROM ${this.tableName}
        WHERE year IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
        LIMIT 10
      `),
      this.findWithCustomerInfo({ limit: 10, orderBy: 'v.created_at DESC' }),
      this.query(`
        SELECT
          v.*,
          u.full_name as customer_name,
          u.phone as customer_phone,
          MAX(a.appointment_date) as last_service_date,
          DATEDIFF(CURDATE(), MAX(a.appointment_date)) as days_since_service
        FROM ${this.tableName} v
        LEFT JOIN users u ON v.user_id = u.id
        LEFT JOIN appointments a ON v.id = a.vehicle_id AND a.status = 'completed'
        GROUP BY v.id
        HAVING days_since_service > 180 OR days_since_service IS NULL
        ORDER BY days_since_service DESC
        LIMIT 10
      `)
    ]);

    return {
      total: totalResult,
      by_brand: byBrandResult,
      by_year: byYearResult,
      recent_vehicles: recentResult,
      needs_maintenance: maintenanceResult
    };
  }

  /**
   * Get vehicle service history
   */
  static async getServiceHistory(vehicleId: number): Promise<any[]> {
    return await this.query(`
      SELECT
        a.*,
        s.name as service_name,
        s.description as service_description,
        u.full_name as mechanic_name,
        r.diagnosis,
        r.work_description,
        r.total_amount,
        r.status as repair_status
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN repairs r ON a.id = r.appointment_id
      LEFT JOIN users u ON r.mechanic_id = u.id
      WHERE a.vehicle_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `, [vehicleId]);
  }

  /**
   * Get upcoming appointments for vehicle
   */
  static async getUpcomingAppointments(vehicleId: number): Promise<any[]> {
    return await this.query(`
      SELECT
        a.*,
        s.name as service_name,
        u.full_name as customer_name
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.vehicle_id = ?
        AND a.appointment_date >= CURDATE()
        AND a.status NOT IN ('cancelled', 'completed')
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `, [vehicleId]);
  }

  /**
   * Update vehicle mileage
   */
  static async updateMileage(vehicleId: number, newMileage: number): Promise<boolean> {
    const vehicle = await this.findById(vehicleId);
    if (!vehicle) return false;

    // Only update if new mileage is higher
    if (newMileage > (vehicle.mileage || 0)) {
      await this.updateById(vehicleId, { mileage: newMileage });
      return true;
    }

    return false;
  }

  /**
   * Get vehicles needing maintenance
   */
  static async getVehiclesNeedingMaintenance(daysSinceLastService: number = 180): Promise<VehicleData[]> {
    return await this.query(`
      SELECT
        v.*,
        u.full_name as customer_name,
        u.phone as customer_phone,
        c.customer_code,
        MAX(a.appointment_date) as last_service_date,
        DATEDIFF(CURDATE(), MAX(a.appointment_date)) as days_since_service
      FROM ${this.tableName} v
      LEFT JOIN customers c ON v.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN appointments a ON v.id = a.vehicle_id AND a.status = 'completed'
      GROUP BY v.id
      HAVING days_since_service > ? OR days_since_service IS NULL
      ORDER BY days_since_service DESC
    `, [daysSinceLastService]);
  }

  /**
   * Get popular vehicle brands
   */
  static async getPopularBrands(limit: number = 10): Promise<Array<{ brand: string; count: number }>> {
    return await this.query(`
      SELECT brand, COUNT(*) as count
      FROM ${this.tableName}
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY count DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Validate license plate format (Vietnam format)
   */
  static validateLicensePlate(licensePlate: string): boolean {
    // Remove spaces and convert to uppercase
    const plate = licensePlate.toUpperCase().replace(/\s+/g, '');

    // Vietnam license plate formats:
    // Old format: 12A-34567 (2 digits, 1 letter, dash, 5 digits)
    // New format: 12A-345.67 (2 digits, 1 letter, dash, 3 digits, dot, 2 digits)
    // Motorcycle: 12-A1-234.56 or 12A-12345

    const patterns = [
      /^\d{2}[A-Z]\d{5}$/,           // 12A12345
      /^\d{2}[A-Z]-\d{5}$/,          // 12A-12345
      /^\d{2}[A-Z]-\d{3}\.\d{2}$/,   // 12A-123.45
      /^\d{2}-[A-Z]\d-\d{3}\.\d{2}$/, // 12-A1-123.45
      /^\d{2}[A-Z]\d-\d{3}\.\d{2}$/   // 12A1-123.45
    ];

    return patterns.some(pattern => pattern.test(plate));
  }

  /**
   * Format license plate for display
   */
  static formatLicensePlate(licensePlate: string): string {
    const plate = licensePlate.toUpperCase().replace(/\s+/g, '');

    // Add formatting based on pattern
    if (/^\d{2}[A-Z]\d{5}$/.test(plate)) {
      // 12A12345 -> 12A-12345
      return plate.replace(/^(\d{2}[A-Z])(\d{5})$/, '$1-$2');
    }

    if (/^\d{2}[A-Z]\d{6}$/.test(plate)) {
      // 12A123456 -> 12A-123.45
      return plate.replace(/^(\d{2}[A-Z])(\d{3})(\d{2})$/, '$1-$2.$3');
    }

    return plate;
  }
}