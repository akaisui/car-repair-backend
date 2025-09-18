import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface VehiclePartCompatibilityData {
  id?: number;
  part_id: number;
  brand?: string;
  model?: string;
  year_from?: number;
  year_to?: number;
  engine_type?: string;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
  part_name?: string;
  part_code?: string;
}

export interface VehicleInfo {
  brand: string;
  model: string;
  year: number;
  engine_type?: string;
}

export class VehiclePartCompatibility {
  private static pool: Pool = db;

  static async create(
    compatibilityData: Omit<VehiclePartCompatibilityData, 'id' | 'created_at' | 'updated_at'>
  ): Promise<number> {
    const { part_id, brand, model, year_from, year_to, engine_type, notes } = compatibilityData;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO vehicle_part_compatibility
       (part_id, brand, model, year_from, year_to, engine_type, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [part_id, brand, model, year_from, year_to, engine_type, notes]
    );

    return result.insertId;
  }

  static async findAll(
    filters: {
      part_id?: number;
      brand?: string;
      model?: string;
      year?: number;
      engine_type?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<VehiclePartCompatibilityData[]> {
    let query = `
      SELECT
        vpc.*,
        p.name as part_name,
        p.part_code
      FROM vehicle_part_compatibility vpc
      JOIN parts p ON vpc.part_id = p.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.part_id) {
      query += ' AND vpc.part_id = ?';
      params.push(filters.part_id);
    }

    if (filters.brand) {
      query += ' AND vpc.brand LIKE ?';
      params.push(`%${filters.brand}%`);
    }

    if (filters.model) {
      query += ' AND vpc.model LIKE ?';
      params.push(`%${filters.model}%`);
    }

    if (filters.year) {
      query += ' AND (vpc.year_from IS NULL OR vpc.year_from <= ?)';
      query += ' AND (vpc.year_to IS NULL OR vpc.year_to >= ?)';
      params.push(filters.year, filters.year);
    }

    if (filters.engine_type) {
      query += ' AND vpc.engine_type LIKE ?';
      params.push(`%${filters.engine_type}%`);
    }

    query += ' ORDER BY vpc.brand, vpc.model, vpc.year_from';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset && filters.limit) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as VehiclePartCompatibilityData[];
  }

  static async findById(id: number): Promise<VehiclePartCompatibilityData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        vpc.*,
        p.name as part_name,
        p.part_code
       FROM vehicle_part_compatibility vpc
       JOIN parts p ON vpc.part_id = p.id
       WHERE vpc.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as VehiclePartCompatibilityData) : null;
  }

  static async findByPartId(partId: number): Promise<VehiclePartCompatibilityData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        vpc.*,
        p.name as part_name,
        p.part_code
       FROM vehicle_part_compatibility vpc
       JOIN parts p ON vpc.part_id = p.id
       WHERE vpc.part_id = ?
       ORDER BY vpc.brand, vpc.model, vpc.year_from`,
      [partId]
    );

    return rows as VehiclePartCompatibilityData[];
  }

  static async findCompatibleParts(
    vehicleInfo: VehicleInfo
  ): Promise<VehiclePartCompatibilityData[]> {
    const { brand, model, year, engine_type } = vehicleInfo;

    let query = `
      SELECT DISTINCT
        vpc.*,
        p.name as part_name,
        p.part_code,
        p.current_quantity,
        p.unit_price,
        p.status
      FROM vehicle_part_compatibility vpc
      JOIN parts p ON vpc.part_id = p.id
      WHERE p.status = 'active'
    `;

    const params: any[] = [];

    // Brand matching (case insensitive)
    if (brand) {
      query += ' AND (vpc.brand IS NULL OR LOWER(vpc.brand) = LOWER(?))';
      params.push(brand);
    }

    // Model matching (case insensitive)
    if (model) {
      query += ' AND (vpc.model IS NULL OR LOWER(vpc.model) = LOWER(?))';
      params.push(model);
    }

    // Year range matching
    if (year) {
      query += ' AND (vpc.year_from IS NULL OR vpc.year_from <= ?)';
      query += ' AND (vpc.year_to IS NULL OR vpc.year_to >= ?)';
      params.push(year, year);
    }

    // Engine type matching (case insensitive, partial match)
    if (engine_type) {
      query += ' AND (vpc.engine_type IS NULL OR LOWER(vpc.engine_type) LIKE LOWER(?))';
      params.push(`%${engine_type}%`);
    }

    query += ' ORDER BY p.name, vpc.brand, vpc.model';

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as VehiclePartCompatibilityData[];
  }

  static async findExactMatches(vehicleInfo: VehicleInfo): Promise<VehiclePartCompatibilityData[]> {
    const { brand, model, year, engine_type } = vehicleInfo;

    let query = `
      SELECT DISTINCT
        vpc.*,
        p.name as part_name,
        p.part_code,
        p.current_quantity,
        p.unit_price,
        p.status
      FROM vehicle_part_compatibility vpc
      JOIN parts p ON vpc.part_id = p.id
      WHERE p.status = 'active'
      AND LOWER(vpc.brand) = LOWER(?)
      AND LOWER(vpc.model) = LOWER(?)
    `;

    const params: any[] = [brand, model];

    // Year range matching
    if (year) {
      query += ' AND (vpc.year_from IS NULL OR vpc.year_from <= ?)';
      query += ' AND (vpc.year_to IS NULL OR vpc.year_to >= ?)';
      params.push(year, year);
    }

    // Engine type matching
    if (engine_type) {
      query += ' AND (vpc.engine_type IS NULL OR LOWER(vpc.engine_type) = LOWER(?))';
      params.push(engine_type);
    }

    query += ' ORDER BY p.name';

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as VehiclePartCompatibilityData[];
  }

  static async update(
    id: number,
    updateData: Partial<VehiclePartCompatibilityData>
  ): Promise<boolean> {
    const allowedFields = ['brand', 'model', 'year_from', 'year_to', 'engine_type', 'notes'];
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(updateData).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0) {
      return false;
    }

    values.push(id);

    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE vehicle_part_compatibility SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM vehicle_part_compatibility WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async deleteByPartId(partId: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM vehicle_part_compatibility WHERE part_id = ?',
      [partId]
    );

    return result.affectedRows > 0;
  }

  static async addBulkCompatibility(
    partId: number,
    vehicleList: Omit<
      VehiclePartCompatibilityData,
      'id' | 'part_id' | 'created_at' | 'updated_at'
    >[]
  ): Promise<number> {
    if (vehicleList.length === 0) {
      return 0;
    }

    const values: any[] = [];
    const placeholders: string[] = [];

    vehicleList.forEach((vehicle) => {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?)');
      values.push(
        partId,
        vehicle.brand,
        vehicle.model,
        vehicle.year_from,
        vehicle.year_to,
        vehicle.engine_type,
        vehicle.notes
      );
    });

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO vehicle_part_compatibility
       (part_id, brand, model, year_from, year_to, engine_type, notes)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    return result.affectedRows;
  }

  static async getSupportedBrands(): Promise<string[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT brand
       FROM vehicle_part_compatibility
       WHERE brand IS NOT NULL
       ORDER BY brand`
    );

    return rows.map((row: any) => row.brand);
  }

  static async getModelsByBrand(brand: string): Promise<string[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT model
       FROM vehicle_part_compatibility
       WHERE brand = ? AND model IS NOT NULL
       ORDER BY model`,
      [brand]
    );

    return rows.map((row: any) => row.model);
  }

  static async getYearRangeByBrandModel(
    brand: string,
    model: string
  ): Promise<{
    min_year: number | null;
    max_year: number | null;
  }> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        MIN(year_from) as min_year,
        MAX(COALESCE(year_to, YEAR(CURDATE()))) as max_year
       FROM vehicle_part_compatibility
       WHERE brand = ? AND model = ?`,
      [brand, model]
    );

    const result = rows[0] as any;
    return {
      min_year: result.min_year,
      max_year: result.max_year,
    };
  }

  static async getEngineTypesByBrandModel(brand: string, model: string): Promise<string[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT engine_type
       FROM vehicle_part_compatibility
       WHERE brand = ? AND model = ? AND engine_type IS NOT NULL
       ORDER BY engine_type`,
      [brand, model]
    );

    return rows.map((row: any) => row.engine_type);
  }

  static async getCompatibilityStats(): Promise<{
    total_compatibility_records: number;
    total_parts_with_compatibility: number;
    total_brands: number;
    total_models: number;
    most_compatible_part: {
      part_id: number;
      part_name: string;
      compatibility_count: number;
    } | null;
  }> {
    const [statsRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_compatibility_records,
        COUNT(DISTINCT part_id) as total_parts_with_compatibility,
        COUNT(DISTINCT brand) as total_brands,
        COUNT(DISTINCT CONCAT(brand, '-', model)) as total_models
       FROM vehicle_part_compatibility`
    );

    const [mostCompatibleRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        vpc.part_id,
        p.name as part_name,
        COUNT(*) as compatibility_count
       FROM vehicle_part_compatibility vpc
       JOIN parts p ON vpc.part_id = p.id
       GROUP BY vpc.part_id, p.name
       ORDER BY compatibility_count DESC
       LIMIT 1`
    );

    const stats = statsRows[0] as any;
    const mostCompatible = mostCompatibleRows.length > 0 ? (mostCompatibleRows[0] as any) : null;

    return {
      total_compatibility_records: stats.total_compatibility_records,
      total_parts_with_compatibility: stats.total_parts_with_compatibility,
      total_brands: stats.total_brands,
      total_models: stats.total_models,
      most_compatible_part: mostCompatible,
    };
  }
}

export default VehiclePartCompatibility;
