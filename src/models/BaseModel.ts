import pool from '../config/database';
import { QueryOptions, PaginationParams, DatabaseConnection } from '../types';
import { calculateOffset, AppError } from '../utils';

/**
 * Base Model class with common database operations
 */
export default class BaseModel {
  protected static tableName: string;
  protected static primaryKey: string = 'id';

  /**
   * Find all records with optional filters
   */
  static async findAll(options: QueryOptions = {}): Promise<any[]> {
    const { where, orderBy = 'created_at DESC', limit, offset } = options;

    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    // Add WHERE conditions
    if (where && Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        let value = where[key];
        // Convert boolean to integer for MySQL compatibility
        if (typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        params.push(value);
        return `${key} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add ORDER BY
    query += ` ORDER BY ${orderBy}`;

    // Add LIMIT and OFFSET
    if (limit) {
      query += ` LIMIT ?`;
      params.push(limit);

      if (offset) {
        query += ` OFFSET ?`;
        params.push(offset);
      }
    }

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(query, params);
      return Array.isArray(rows) ? rows : [];
    } finally {
      connection.release();
    }
  }

  /**
   * Find records with pagination
   */
  static async findPaginated(pagination: PaginationParams, options: QueryOptions = {}): Promise<{ data: any[], total: number }> {
    const { page, limit, sortBy, sortOrder } = pagination;
    const offset = calculateOffset(page, limit);

    // Get total count
    const total = await this.count(options.where);

    // Get paginated data
    const data = await this.findAll({
      ...options,
      orderBy: `${sortBy} ${sortOrder}`,
      limit,
      offset,
    });

    return { data, total };
  }

  /**
   * Find single record by ID
   */
  static async findById(id: number): Promise<any | null> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`,
        [id]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  }

  /**
   * Find single record by criteria
   */
  static async findOne(where: Record<string, any>): Promise<any | null> {
    if (!where || Object.keys(where).length === 0) {
      throw new AppError('Where condition is required', 400);
    }

    const conditions = Object.keys(where).map(key => `${key} = ?`);
    const params = Object.values(where).map(value => {
      // Convert boolean to integer for MySQL compatibility
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      return value;
    });

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        `SELECT * FROM ${this.tableName} WHERE ${conditions.join(' AND ')} LIMIT 1`,
        params
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  }

  /**
   * Create new record
   */
  static async create(data: Record<string, any>): Promise<any> {
    if (!data || Object.keys(data).length === 0) {
      throw new AppError('Data is required for create operation', 400);
    }

    // Add timestamps
    data.created_at = new Date();
    data.updated_at = new Date();

    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Object.values(data);

    const connection = await pool.getConnection();
    try {
      const [result] = await connection.execute(
        `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
        values
      );

      const insertId = (result as any).insertId;
      return await this.findById(insertId);
    } finally {
      connection.release();
    }
  }

  /**
   * Update record by ID
   */
  static async updateById(id: number, data: Record<string, any>): Promise<any | null> {
    if (!data || Object.keys(data).length === 0) {
      throw new AppError('Data is required for update operation', 400);
    }

    // Add updated timestamp
    data.updated_at = new Date();

    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(data), id];

    const connection = await pool.getConnection();
    try {
      const [result] = await connection.execute(
        `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`,
        values
      );

      if ((result as any).affectedRows === 0) {
        return null;
      }

      return await this.findById(id);
    } finally {
      connection.release();
    }
  }

  /**
   * Delete record by ID
   */
  static async deleteById(id: number): Promise<boolean> {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.execute(
        `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`,
        [id]
      );

      return (result as any).affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Soft delete record by ID (set is_active = false)
   */
  static async softDeleteById(id: number): Promise<boolean> {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.execute(
        `UPDATE ${this.tableName} SET is_active = false, updated_at = ? WHERE ${this.primaryKey} = ?`,
        [new Date(), id]
      );

      return (result as any).affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Count records
   */
  static async count(where?: Record<string, any>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        let value = where[key];
        // Convert boolean to integer for MySQL compatibility
        if (typeof value === 'boolean') {
          value = value ? 1 : 0;
        }
        params.push(value);
        return `${key} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(query, params);
      return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).count : 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Check if record exists
   */
  static async exists(where: Record<string, any>): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Execute raw query
   */
  static async query(sql: string, params: any[] = []): Promise<any> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(sql, params);
      return rows;
    } finally {
      connection.release();
    }
  }

  /**
   * Begin transaction
   */
  static async getTransaction(): Promise<DatabaseConnection> {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit transaction
   */
  static async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as any).commit();
    (connection as any).release();
  }

  /**
   * Rollback transaction
   */
  static async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await (connection as any).rollback();
    (connection as any).release();
  }
}