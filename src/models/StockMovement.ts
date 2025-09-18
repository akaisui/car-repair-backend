import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface StockMovementData {
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
  part_name?: string;
  part_code?: string;
  performed_by_name?: string;
}

export class StockMovement {
  private static pool: Pool = db;

  static async create(movementData: Omit<StockMovementData, 'id' | 'created_at'>): Promise<number> {
    const {
      part_id,
      movement_type,
      quantity,
      unit_cost,
      total_cost,
      reference_type,
      reference_id,
      notes,
      performed_by,
    } = movementData;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO stock_movements
       (part_id, movement_type, quantity, unit_cost, total_cost, reference_type, reference_id, notes, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        part_id,
        movement_type,
        quantity,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        notes,
        performed_by,
      ]
    );

    return result.insertId;
  }

  static async findAll(
    filters: {
      part_id?: number;
      movement_type?: string;
      date_from?: string;
      date_to?: string;
      reference_type?: string;
      performed_by?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<StockMovementData[]> {
    let query = `
      SELECT
        sm.*,
        p.name as part_name,
        p.part_code,
        u.full_name as performed_by_name
      FROM stock_movements sm
      JOIN parts p ON sm.part_id = p.id
      LEFT JOIN users u ON sm.performed_by = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.part_id) {
      query += ' AND sm.part_id = ?';
      params.push(filters.part_id);
    }

    if (filters.movement_type) {
      query += ' AND sm.movement_type = ?';
      params.push(filters.movement_type);
    }

    if (filters.date_from) {
      query += ' AND DATE(sm.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(sm.created_at) <= ?';
      params.push(filters.date_to);
    }

    if (filters.reference_type) {
      query += ' AND sm.reference_type = ?';
      params.push(filters.reference_type);
    }

    if (filters.performed_by) {
      query += ' AND sm.performed_by = ?';
      params.push(filters.performed_by);
    }

    query += ' ORDER BY sm.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset && filters.limit) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as StockMovementData[];
  }

  static async findById(id: number): Promise<StockMovementData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        sm.*,
        p.name as part_name,
        p.part_code,
        u.full_name as performed_by_name
       FROM stock_movements sm
       JOIN parts p ON sm.part_id = p.id
       LEFT JOIN users u ON sm.performed_by = u.id
       WHERE sm.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as StockMovementData) : null;
  }

  static async findByPartId(partId: number, limit: number = 50): Promise<StockMovementData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        sm.*,
        p.name as part_name,
        p.part_code,
        u.full_name as performed_by_name
       FROM stock_movements sm
       JOIN parts p ON sm.part_id = p.id
       LEFT JOIN users u ON sm.performed_by = u.id
       WHERE sm.part_id = ?
       ORDER BY sm.created_at DESC
       LIMIT ?`,
      [partId, limit]
    );

    return rows as StockMovementData[];
  }

  static async getMovementSummary(
    partId: number,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    total_in: number;
    total_out: number;
    total_adjustments: number;
    total_losses: number;
    total_returns: number;
    net_movement: number;
  }> {
    let query = `
      SELECT
        SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END) as total_out,
        SUM(CASE WHEN movement_type = 'adjustment' THEN quantity ELSE 0 END) as total_adjustments,
        SUM(CASE WHEN movement_type = 'loss' THEN quantity ELSE 0 END) as total_losses,
        SUM(CASE WHEN movement_type = 'return' THEN quantity ELSE 0 END) as total_returns,
        SUM(
          CASE
            WHEN movement_type IN ('in', 'return') THEN quantity
            WHEN movement_type IN ('out', 'loss') THEN -quantity
            WHEN movement_type = 'adjustment' THEN quantity
            ELSE 0
          END
        ) as net_movement
      FROM stock_movements
      WHERE part_id = ?
    `;

    const params: any[] = [partId];

    if (dateFrom) {
      query += ' AND DATE(created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(created_at) <= ?';
      params.push(dateTo);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);

    const result = rows[0] as any;
    return {
      total_in: result.total_in || 0,
      total_out: result.total_out || 0,
      total_adjustments: result.total_adjustments || 0,
      total_losses: result.total_losses || 0,
      total_returns: result.total_returns || 0,
      net_movement: result.net_movement || 0,
    };
  }

  static async getInventoryValueMovements(
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    total_value_in: number;
    total_value_out: number;
    net_value_change: number;
  }> {
    let query = `
      SELECT
        SUM(CASE WHEN movement_type IN ('in', 'return') THEN COALESCE(total_cost, unit_cost * quantity, 0) ELSE 0 END) as total_value_in,
        SUM(CASE WHEN movement_type IN ('out', 'loss') THEN COALESCE(total_cost, unit_cost * quantity, 0) ELSE 0 END) as total_value_out,
        SUM(
          CASE
            WHEN movement_type IN ('in', 'return') THEN COALESCE(total_cost, unit_cost * quantity, 0)
            WHEN movement_type IN ('out', 'loss') THEN -COALESCE(total_cost, unit_cost * quantity, 0)
            ELSE 0
          END
        ) as net_value_change
      FROM stock_movements
      WHERE 1=1
    `;

    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(created_at) <= ?';
      params.push(dateTo);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);

    const result = rows[0] as any;
    return {
      total_value_in: result.total_value_in || 0,
      total_value_out: result.total_value_out || 0,
      net_value_change: result.net_value_change || 0,
    };
  }

  static async getDailyMovements(days: number = 30): Promise<
    {
      date: string;
      total_in: number;
      total_out: number;
      net_movement: number;
    }[]
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN movement_type IN ('in', 'return') THEN quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN movement_type IN ('out', 'loss') THEN quantity ELSE 0 END) as total_out,
        SUM(
          CASE
            WHEN movement_type IN ('in', 'return') THEN quantity
            WHEN movement_type IN ('out', 'loss') THEN -quantity
            WHEN movement_type = 'adjustment' THEN quantity
            ELSE 0
          END
        ) as net_movement
       FROM stock_movements
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [days]
    );

    return rows as any[];
  }

  static async getTopMovingParts(
    limit: number = 10,
    days: number = 30
  ): Promise<
    {
      part_id: number;
      part_name: string;
      part_code: string;
      total_movements: number;
      total_in: number;
      total_out: number;
    }[]
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        sm.part_id,
        p.name as part_name,
        p.part_code,
        COUNT(*) as total_movements,
        SUM(CASE WHEN sm.movement_type IN ('in', 'return') THEN sm.quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN sm.movement_type IN ('out', 'loss') THEN sm.quantity ELSE 0 END) as total_out
       FROM stock_movements sm
       JOIN parts p ON sm.part_id = p.id
       WHERE sm.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY sm.part_id, p.name, p.part_code
       ORDER BY total_movements DESC
       LIMIT ?`,
      [days, limit]
    );

    return rows as any[];
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM stock_movements WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async deleteByPartId(partId: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM stock_movements WHERE part_id = ?',
      [partId]
    );

    return result.affectedRows > 0;
  }
}

export default StockMovement;
