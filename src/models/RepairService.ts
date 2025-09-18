import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface RepairServiceData {
  id?: number;
  repair_id: number;
  service_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  created_at?: Date;

  // Joined data from service
  service_name?: string;
  service_description?: string;
  service_category_name?: string;
  duration_minutes?: number;
}

export class RepairService {
  private static pool: Pool = db;

  static async create(data: Omit<RepairServiceData, 'id' | 'created_at'>): Promise<number> {
    const {
      repair_id,
      service_id,
      quantity,
      unit_price,
      total_price,
      notes
    } = data;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO repair_services (repair_id, service_id, quantity, unit_price, total_price, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [repair_id, service_id, quantity, unit_price, total_price, notes]
    );

    return result.insertId;
  }

  static async findByRepairId(repairId: number): Promise<RepairServiceData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        rs.*,
        s.name as service_name,
        s.description as service_description,
        s.duration_minutes,
        sc.name as service_category_name
       FROM repair_services rs
       JOIN services s ON rs.service_id = s.id
       LEFT JOIN service_categories sc ON s.category_id = sc.id
       WHERE rs.repair_id = ?
       ORDER BY rs.created_at`,
      [repairId]
    );

    return rows as RepairServiceData[];
  }

  static async findById(id: number): Promise<RepairServiceData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        rs.*,
        s.name as service_name,
        s.description as service_description,
        s.duration_minutes,
        sc.name as service_category_name
       FROM repair_services rs
       JOIN services s ON rs.service_id = s.id
       LEFT JOIN service_categories sc ON s.category_id = sc.id
       WHERE rs.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as RepairServiceData) : null;
  }

  static async update(id: number, data: Partial<RepairServiceData>): Promise<boolean> {
    const allowedFields = ['quantity', 'unit_price', 'total_price', 'notes'];
    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
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
      `UPDATE repair_services SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM repair_services WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async deleteByRepairId(repairId: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM repair_services WHERE repair_id = ?',
      [repairId]
    );

    return result.affectedRows > 0;
  }

  static async addService(repairId: number, serviceId: number, quantity: number = 1, customPrice?: number): Promise<number> {
    // Get service details
    const [serviceRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT price, min_price, max_price FROM services WHERE id = ?',
      [serviceId]
    );

    if (serviceRows.length === 0) {
      throw new Error('Service not found');
    }

    const service = serviceRows[0] as any;
    let unitPrice: number = customPrice || service.price || service.min_price || 0;

    const totalPrice = unitPrice * quantity;

    return await this.create({
      repair_id: repairId,
      service_id: serviceId,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice
    });
  }

  static async updateQuantity(id: number, quantity: number): Promise<boolean> {
    const repairService = await this.findById(id);
    if (!repairService) {
      return false;
    }

    const totalPrice = repairService.unit_price * quantity;

    return await this.update(id, {
      quantity,
      total_price: totalPrice
    });
  }

  static async updatePrice(id: number, unitPrice: number): Promise<boolean> {
    const repairService = await this.findById(id);
    if (!repairService) {
      return false;
    }

    const totalPrice = unitPrice * repairService.quantity;

    return await this.update(id, {
      unit_price: unitPrice,
      total_price: totalPrice
    });
  }

  static async getTotalCost(repairId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(SUM(total_price), 0) as total FROM repair_services WHERE repair_id = ?',
      [repairId]
    );

    return (rows[0] as any).total;
  }

  static async getServicesSummary(repairId: number): Promise<{
    total_services: number;
    total_cost: number;
    estimated_duration: number;
  }> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_services,
        COALESCE(SUM(rs.total_price), 0) as total_cost,
        COALESCE(SUM(s.duration_minutes * rs.quantity), 0) as estimated_duration
       FROM repair_services rs
       JOIN services s ON rs.service_id = s.id
       WHERE rs.repair_id = ?`,
      [repairId]
    );

    const result = rows[0] as any;
    return {
      total_services: result.total_services,
      total_cost: result.total_cost,
      estimated_duration: result.estimated_duration
    };
  }

  static async getPopularServices(limit: number = 10, dateFrom?: string, dateTo?: string): Promise<{
    service_id: number;
    service_name: string;
    category_name: string;
    usage_count: number;
    total_revenue: number;
    avg_price: number;
  }[]> {
    let query = `
      SELECT
        s.id as service_id,
        s.name as service_name,
        sc.name as category_name,
        COUNT(rs.id) as usage_count,
        SUM(rs.total_price) as total_revenue,
        AVG(rs.unit_price) as avg_price
      FROM repair_services rs
      JOIN services s ON rs.service_id = s.id
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(rs.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(rs.created_at) <= ?';
      params.push(dateTo);
    }

    query += `
      GROUP BY s.id, s.name, sc.name
      ORDER BY usage_count DESC, total_revenue DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
  }

  static async getServiceUsageByCategory(dateFrom?: string, dateTo?: string): Promise<{
    category_name: string;
    service_count: number;
    total_usage: number;
    total_revenue: number;
  }[]> {
    let query = `
      SELECT
        COALESCE(sc.name, 'Không phân loại') as category_name,
        COUNT(DISTINCT s.id) as service_count,
        COUNT(rs.id) as total_usage,
        SUM(rs.total_price) as total_revenue
      FROM repair_services rs
      JOIN services s ON rs.service_id = s.id
      LEFT JOIN service_categories sc ON s.category_id = sc.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(rs.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(rs.created_at) <= ?';
      params.push(dateTo);
    }

    query += `
      GROUP BY sc.id, sc.name
      ORDER BY total_revenue DESC
    `;

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
  }

  static async bulkAddServices(repairId: number, services: Array<{
    service_id: number;
    quantity?: number;
    custom_price?: number;
    notes?: string;
  }>): Promise<number[]> {
    const connection = await this.pool.getConnection();
    const addedIds: number[] = [];

    try {
      await connection.beginTransaction();

      for (const serviceData of services) {
        const id = await this.addService(
          repairId,
          serviceData.service_id,
          serviceData.quantity || 1,
          serviceData.custom_price
        );

        if (serviceData.notes) {
          await this.update(id, { notes: serviceData.notes });
        }

        addedIds.push(id);
      }

      await connection.commit();
      return addedIds;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async checkServiceExists(repairId: number, serviceId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id FROM repair_services WHERE repair_id = ? AND service_id = ?',
      [repairId, serviceId]
    );

    return rows.length > 0;
  }

  static async duplicateService(id: number, newQuantity?: number): Promise<number> {
    const repairService = await this.findById(id);
    if (!repairService) {
      throw new Error('Repair service not found');
    }

    const quantity = newQuantity || repairService.quantity;
    const totalPrice = repairService.unit_price * quantity;

    return await this.create({
      repair_id: repairService.repair_id,
      service_id: repairService.service_id,
      quantity,
      unit_price: repairService.unit_price,
      total_price: totalPrice,
      notes: repairService.notes
    });
  }
}

export default RepairService;