import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface InventoryAlertData {
  id?: number;
  part_id: number;
  alert_type: 'low_stock' | 'out_of_stock' | 'overstock' | 'expiring';
  message: string;
  is_acknowledged?: boolean;
  acknowledged_by?: number;
  acknowledged_at?: Date;
  created_at?: Date;
  part_name?: string;
  part_code?: string;
  current_quantity?: number;
  acknowledged_by_name?: string;
}

export class InventoryAlert {
  private static pool: Pool = db;

  static async create(alertData: Omit<InventoryAlertData, 'id' | 'created_at'>): Promise<number> {
    const { part_id, alert_type, message, is_acknowledged = false } = alertData;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO inventory_alerts (part_id, alert_type, message, is_acknowledged)
       VALUES (?, ?, ?, ?)`,
      [part_id, alert_type, message, is_acknowledged]
    );

    return result.insertId;
  }

  static async findAll(
    filters: {
      part_id?: number;
      alert_type?: string;
      is_acknowledged?: boolean;
      date_from?: string;
      date_to?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<InventoryAlertData[]> {
    let query = `
      SELECT
        ia.*,
        p.name as part_name,
        p.part_code,
        p.current_quantity,
        u.full_name as acknowledged_by_name
      FROM inventory_alerts ia
      JOIN parts p ON ia.part_id = p.id
      LEFT JOIN users u ON ia.acknowledged_by = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.part_id) {
      query += ' AND ia.part_id = ?';
      params.push(filters.part_id);
    }

    if (filters.alert_type) {
      query += ' AND ia.alert_type = ?';
      params.push(filters.alert_type);
    }

    if (filters.is_acknowledged !== undefined) {
      query += ' AND ia.is_acknowledged = ?';
      params.push(filters.is_acknowledged);
    }

    if (filters.date_from) {
      query += ' AND DATE(ia.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(ia.created_at) <= ?';
      params.push(filters.date_to);
    }

    query += ' ORDER BY ia.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset && filters.limit) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as InventoryAlertData[];
  }

  static async findById(id: number): Promise<InventoryAlertData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        ia.*,
        p.name as part_name,
        p.part_code,
        p.current_quantity,
        u.full_name as acknowledged_by_name
       FROM inventory_alerts ia
       JOIN parts p ON ia.part_id = p.id
       LEFT JOIN users u ON ia.acknowledged_by = u.id
       WHERE ia.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as InventoryAlertData) : null;
  }

  static async findByPartId(partId: number, limit: number = 20): Promise<InventoryAlertData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        ia.*,
        p.name as part_name,
        p.part_code,
        p.current_quantity,
        u.full_name as acknowledged_by_name
       FROM inventory_alerts ia
       JOIN parts p ON ia.part_id = p.id
       LEFT JOIN users u ON ia.acknowledged_by = u.id
       WHERE ia.part_id = ?
       ORDER BY ia.created_at DESC
       LIMIT ?`,
      [partId, limit]
    );

    return rows as InventoryAlertData[];
  }

  static async acknowledge(id: number, acknowledgedBy: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE inventory_alerts
       SET is_acknowledged = true, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [acknowledgedBy, id]
    );

    return result.affectedRows > 0;
  }

  static async acknowledgeMultiple(ids: number[], acknowledgedBy: number): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE inventory_alerts
       SET is_acknowledged = true, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      [acknowledgedBy, ...ids]
    );

    return result.affectedRows;
  }

  static async acknowledgeByPartId(partId: number, acknowledgedBy: number): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE inventory_alerts
       SET is_acknowledged = true, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP
       WHERE part_id = ? AND is_acknowledged = false`,
      [acknowledgedBy, partId]
    );

    return result.affectedRows;
  }

  static async getUnacknowledgedCount(): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM inventory_alerts WHERE is_acknowledged = false'
    );

    return (rows[0] as any).count;
  }

  static async getAlertsByType(): Promise<
    {
      alert_type: string;
      total_alerts: number;
      unacknowledged_alerts: number;
    }[]
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        alert_type,
        COUNT(*) as total_alerts,
        SUM(CASE WHEN is_acknowledged = false THEN 1 ELSE 0 END) as unacknowledged_alerts
       FROM inventory_alerts
       GROUP BY alert_type
       ORDER BY total_alerts DESC`
    );

    return rows as any[];
  }

  static async createLowStockAlert(
    partId: number,
    currentQuantity: number,
    minStockLevel: number
  ): Promise<number | null> {
    // Check if there's already an unacknowledged low stock alert for this part
    const [existing] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM inventory_alerts
       WHERE part_id = ? AND alert_type = 'low_stock' AND is_acknowledged = false`,
      [partId]
    );

    if (existing.length > 0) {
      return null; // Alert already exists
    }

    const message = `Phụ tùng sắp hết hàng! Số lượng hiện tại: ${currentQuantity}, Mức tối thiểu: ${minStockLevel}`;

    return await this.create({
      part_id: partId,
      alert_type: 'low_stock',
      message,
    });
  }

  static async createOutOfStockAlert(partId: number): Promise<number | null> {
    // Check if there's already an unacknowledged out of stock alert for this part
    const [existing] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM inventory_alerts
       WHERE part_id = ? AND alert_type = 'out_of_stock' AND is_acknowledged = false`,
      [partId]
    );

    if (existing.length > 0) {
      return null; // Alert already exists
    }

    const message = 'Phụ tùng đã hết hàng! Cần nhập hàng ngay lập tức.';

    return await this.create({
      part_id: partId,
      alert_type: 'out_of_stock',
      message,
    });
  }

  static async createOverstockAlert(
    partId: number,
    currentQuantity: number,
    maxStockLevel: number
  ): Promise<number | null> {
    // Check if there's already an unacknowledged overstock alert for this part
    const [existing] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM inventory_alerts
       WHERE part_id = ? AND alert_type = 'overstock' AND is_acknowledged = false`,
      [partId]
    );

    if (existing.length > 0) {
      return null; // Alert already exists
    }

    const message = `Tồn kho quá cao! Số lượng hiện tại: ${currentQuantity}, Mức tối đa: ${maxStockLevel}`;

    return await this.create({
      part_id: partId,
      alert_type: 'overstock',
      message,
    });
  }

  static async createExpiringAlert(partId: number, daysToExpiry: number): Promise<number | null> {
    // Check if there's already an unacknowledged expiring alert for this part
    const [existing] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM inventory_alerts
       WHERE part_id = ? AND alert_type = 'expiring' AND is_acknowledged = false`,
      [partId]
    );

    if (existing.length > 0) {
      return null; // Alert already exists
    }

    const message = `Phụ tùng sắp hết hạn sử dụng! Còn ${daysToExpiry} ngày.`;

    return await this.create({
      part_id: partId,
      alert_type: 'expiring',
      message,
    });
  }

  static async checkAndCreateAlerts(partId: number): Promise<{
    created_alerts: string[];
    total_created: number;
  }> {
    // Get part information
    const [partRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        id,
        name,
        current_quantity,
        min_stock_level,
        max_stock_level,
        expiry_date
       FROM parts
       WHERE id = ?`,
      [partId]
    );

    if (partRows.length === 0) {
      throw new Error('Part not found');
    }

    const part = partRows[0] as any;
    const createdAlerts: string[] = [];

    // Check out of stock
    if (part.current_quantity <= 0) {
      const alertId = await this.createOutOfStockAlert(partId);
      if (alertId) {
        createdAlerts.push('out_of_stock');
      }
    }
    // Check low stock
    else if (part.min_stock_level && part.current_quantity <= part.min_stock_level) {
      const alertId = await this.createLowStockAlert(
        partId,
        part.current_quantity,
        part.min_stock_level
      );
      if (alertId) {
        createdAlerts.push('low_stock');
      }
    }

    // Check overstock
    if (part.max_stock_level && part.current_quantity > part.max_stock_level) {
      const alertId = await this.createOverstockAlert(
        partId,
        part.current_quantity,
        part.max_stock_level
      );
      if (alertId) {
        createdAlerts.push('overstock');
      }
    }

    // Check expiring (if expiry_date exists and is within 30 days)
    if (part.expiry_date) {
      const expiryDate = new Date(part.expiry_date);
      const currentDate = new Date();
      const daysToExpiry = Math.ceil(
        (expiryDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysToExpiry <= 30 && daysToExpiry > 0) {
        const alertId = await this.createExpiringAlert(partId, daysToExpiry);
        if (alertId) {
          createdAlerts.push('expiring');
        }
      }
    }

    return {
      created_alerts: createdAlerts,
      total_created: createdAlerts.length,
    };
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM inventory_alerts WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async deleteByPartId(partId: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM inventory_alerts WHERE part_id = ?',
      [partId]
    );

    return result.affectedRows > 0;
  }

  static async deleteAcknowledgedAlerts(olderThanDays: number = 30): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `DELETE FROM inventory_alerts
       WHERE is_acknowledged = true
       AND acknowledged_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [olderThanDays]
    );

    return result.affectedRows;
  }
}

export default InventoryAlert;
