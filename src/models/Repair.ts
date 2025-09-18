import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface RepairData {
  id?: number;
  repair_code: string;
  appointment_id?: number;
  user_id: number;
  vehicle_id: number;
  mechanic_id?: number;
  status: 'pending' | 'diagnosing' | 'waiting_parts' | 'in_progress' | 'completed' | 'cancelled';
  diagnosis?: string;
  work_description?: string;
  start_date?: Date;
  completion_date?: Date;
  total_amount?: number;
  labor_cost?: number;
  parts_cost?: number;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;

  // Joined data
  customer_name?: string;
  customer_phone?: string;
  vehicle_license_plate?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  mechanic_name?: string;
  appointment_date?: Date;
  services_count?: number;
  parts_count?: number;
}

export interface RepairSummary {
  total_repairs: number;
  pending_repairs: number;
  in_progress_repairs: number;
  completed_repairs: number;
  cancelled_repairs: number;
  total_revenue: number;
  avg_completion_time: number;
  avg_repair_cost: number;
}

export interface RepairSearchFilters {
  status?: string;
  user_id?: number;
  vehicle_id?: number;
  mechanic_id?: number;
  appointment_id?: number;
  date_from?: string;
  date_to?: string;
  repair_code?: string;
  customer_phone?: string;
  license_plate?: string;
  min_cost?: number;
  max_cost?: number;
}

export class Repair {
  private static pool: Pool = db;

  static async create(repairData: Omit<RepairData, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    // Generate unique repair code if not provided
    if (!repairData.repair_code) {
      repairData.repair_code = await this.generateRepairCode();
    }

    const {
      repair_code,
      appointment_id,
      user_id,
      vehicle_id,
      mechanic_id,
      status = 'pending',
      diagnosis,
      work_description,
      start_date,
      completion_date,
      total_amount,
      labor_cost,
      parts_cost,
      notes
    } = repairData;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO repairs
       (repair_code, appointment_id, user_id, vehicle_id, mechanic_id, status,
        diagnosis, work_description, start_date, completion_date, total_amount,
        labor_cost, parts_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [repair_code, appointment_id || null, user_id, vehicle_id, mechanic_id || null, status,
       diagnosis || null, work_description || null, start_date || null, completion_date || null, total_amount || null,
       labor_cost || null, parts_cost || null, notes || null]
    );

    return result.insertId;
  }

  static async findAll(filters: RepairSearchFilters & {
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  } = {}): Promise<RepairData[]> {
    let query = `
      SELECT
        r.*,
        cu.full_name as customer_name,
        cu.phone as customer_phone,
        a.appointment_date
      FROM repairs r
      LEFT JOIN users cu ON r.user_id = cu.id
      LEFT JOIN appointments a ON r.appointment_id = a.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // Apply filters
    if (filters.status) {
      query += ' AND r.status = ?';
      params.push(filters.status);
    }

    if (filters.user_id) {
      query += ' AND r.user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.vehicle_id) {
      query += ' AND r.vehicle_id = ?';
      params.push(filters.vehicle_id);
    }

    if (filters.mechanic_id) {
      query += ' AND r.mechanic_id = ?';
      params.push(filters.mechanic_id);
    }

    if (filters.appointment_id) {
      query += ' AND r.appointment_id = ?';
      params.push(filters.appointment_id);
    }

    if (filters.repair_code) {
      query += ' AND r.repair_code LIKE ?';
      params.push(`%${filters.repair_code}%`);
    }

    if (filters.customer_phone) {
      query += ' AND cu.phone LIKE ?';
      params.push(`%${filters.customer_phone}%`);
    }

    if (filters.license_plate) {
      query += ' AND v.license_plate LIKE ?';
      params.push(`%${filters.license_plate}%`);
    }

    if (filters.date_from) {
      query += ' AND DATE(r.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(r.created_at) <= ?';
      params.push(filters.date_to);
    }

    if (filters.min_cost) {
      query += ' AND r.total_amount >= ?';
      params.push(filters.min_cost);
    }

    if (filters.max_cost) {
      query += ' AND r.total_amount <= ?';
      params.push(filters.max_cost);
    }

    // Ordering
    const orderBy = filters.order_by || 'created_at';
    const orderDirection = filters.order_direction || 'DESC';
    query += ` ORDER BY r.${orderBy} ${orderDirection}`;

    // Pagination
    if (filters.limit) {
      if (filters.offset) {
        query += ' LIMIT ?, ?';
        params.push(filters.offset, filters.limit);
      } else {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }
    }

    // Debug logging
    console.log('🔍 SQL Query:', query);
    console.log('🔍 Parameters:', params);
    console.log('🔍 Parameters length:', params.length);
    console.log('🔍 Parameters types:', params.map(p => typeof p));

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as RepairData[];
  }

  static async findById(id: number): Promise<RepairData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        r.*,
        cu.full_name as customer_name,
        cu.phone as customer_phone,
        cu.email as customer_email,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        v.year as vehicle_year,
        u.full_name as mechanic_name,
        a.appointment_date,
        (SELECT COUNT(*) FROM repair_services rs WHERE rs.repair_id = r.id) as services_count,
        (SELECT COUNT(*) FROM repair_parts rp WHERE rp.repair_id = r.id) as parts_count
       FROM repairs r
       JOIN users cu ON r.user_id = cu.id
       JOIN vehicles v ON r.vehicle_id = v.id
       LEFT JOIN users u ON r.mechanic_id = u.id
       LEFT JOIN appointments a ON r.appointment_id = a.id
       WHERE r.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as RepairData) : null;
  }

  static async findByRepairCode(repairCode: string): Promise<RepairData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        r.*,
        cu.full_name as customer_name,
        cu.phone as customer_phone,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        u.full_name as mechanic_name
       FROM repairs r
       JOIN users cu ON r.user_id = cu.id
       JOIN vehicles v ON r.vehicle_id = v.id
       LEFT JOIN users u ON r.mechanic_id = u.id
       WHERE r.repair_code = ?`,
      [repairCode]
    );

    return rows.length > 0 ? (rows[0] as RepairData) : null;
  }

  static async update(id: number, updateData: Partial<RepairData>): Promise<boolean> {
    const allowedFields = [
      'mechanic_id', 'status', 'diagnosis', 'work_description', 'start_date',
      'completion_date', 'total_amount', 'labor_cost', 'parts_cost', 'notes'
    ];

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
      `UPDATE repairs SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  static async updateStatus(id: number, status: RepairData['status'], notes?: string): Promise<boolean> {
    const updateData: any = { status };

    // Auto-set dates based on status
    if (status === 'in_progress' && !await this.getStartDate(id)) {
      updateData.start_date = new Date();
    } else if (status === 'completed') {
      updateData.completion_date = new Date();
    }

    if (notes) {
      updateData.notes = notes;
    }

    return await this.update(id, updateData);
  }

  static async assignMechanic(id: number, mechanicId: number): Promise<boolean> {
    return await this.update(id, { mechanic_id: mechanicId });
  }

  static async updateCosts(id: number, costs: {
    labor_cost?: number;
    parts_cost?: number;
  }): Promise<boolean> {
    const { labor_cost, parts_cost } = costs;

    // Calculate total cost
    let total_cost = 0;
    if (labor_cost) total_cost += labor_cost;
    if (parts_cost) total_cost += parts_cost;

    const updateData = {
      ...costs,
      total_amount: total_cost > 0 ? total_cost : 0
    };

    return await this.update(id, updateData);
  }

  static async recalculateCosts(id: number): Promise<boolean> {
    // Get labor costs from services
    const [laborResult] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_price), 0) as labor_cost
       FROM repair_services
       WHERE repair_id = ?`,
      [id]
    );

    // Get parts costs from parts
    const [partsResult] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_price), 0) as parts_cost
       FROM repair_parts
       WHERE repair_id = ?`,
      [id]
    );

    const laborCost = (laborResult[0] as any).labor_cost || 0;
    const partsCost = (partsResult[0] as any).parts_cost || 0;

    const totalCost = laborCost + partsCost;

    return await this.update(id, {
      labor_cost: laborCost,
      parts_cost: partsCost,
      total_amount: totalCost > 0 ? totalCost : 0
    });
  }

  static async delete(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Delete related records first
      await connection.execute('DELETE FROM repair_services WHERE repair_id = ?', [id]);
      await connection.execute('DELETE FROM repair_parts WHERE repair_id = ?', [id]);

      // Delete repair
      const [result] = await connection.execute<ResultSetHeader>(
        'DELETE FROM repairs WHERE id = ?',
        [id]
      );

      await connection.commit();
      return result.affectedRows > 0;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getRepairHistory(customerId?: number, vehicleId?: number, limit: number = 20): Promise<RepairData[]> {
    let query = `
      SELECT
        r.*,
        cu.full_name as customer_name,
        cu.phone as customer_phone,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        u.full_name as mechanic_name,
        (SELECT COUNT(*) FROM repair_services rs WHERE rs.repair_id = r.id) as services_count,
        (SELECT COUNT(*) FROM repair_parts rp WHERE rp.repair_id = r.id) as parts_count
      FROM repairs r
      JOIN users cu ON r.user_id = cu.id
      JOIN vehicles v ON r.vehicle_id = v.id
      LEFT JOIN users u ON r.mechanic_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (customerId) {
      query += ' AND r.user_id = ?';
      params.push(customerId);
    }

    if (vehicleId) {
      query += ' AND r.vehicle_id = ?';
      params.push(vehicleId);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as RepairData[];
  }

  static async getRepairsByStatus(status: RepairData['status']): Promise<RepairData[]> {
    return await this.findAll({ status });
  }

  static async getPendingRepairs(): Promise<RepairData[]> {
    return await this.getRepairsByStatus('pending');
  }

  static async getInProgressRepairs(): Promise<RepairData[]> {
    return await this.getRepairsByStatus('in_progress');
  }

  static async getRepairsByMechanic(mechanicId: number, status?: RepairData['status']): Promise<RepairData[]> {
    const filters: RepairSearchFilters = { mechanic_id: mechanicId };
    if (status) filters.status = status;

    return await this.findAll(filters);
  }

  static async getSummary(dateFrom?: string, dateTo?: string): Promise<RepairSummary> {
    let query = 'SELECT * FROM repairs WHERE 1=1';
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
    const repairs = rows as RepairData[];

    const summary: RepairSummary = {
      total_repairs: repairs.length,
      pending_repairs: repairs.filter(r => r.status === 'pending').length,
      in_progress_repairs: repairs.filter(r => ['diagnosing', 'waiting_parts', 'in_progress'].includes(r.status)).length,
      completed_repairs: repairs.filter(r => r.status === 'completed').length,
      cancelled_repairs: repairs.filter(r => r.status === 'cancelled').length,
      total_revenue: repairs
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + (r.total_amount || 0), 0),
      avg_completion_time: 0, // Will be calculated
      avg_repair_cost: 0
    };

    // Calculate average completion time (in days)
    const completedRepairs = repairs.filter(r =>
      r.status === 'completed' && r.start_date && r.completion_date
    );

    if (completedRepairs.length > 0) {
      const totalDays = completedRepairs.reduce((sum, r) => {
        const start = new Date(r.start_date!);
        const end = new Date(r.completion_date!);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);

      summary.avg_completion_time = totalDays / completedRepairs.length;
    }

    // Calculate average repair cost
    if (summary.completed_repairs > 0) {
      summary.avg_repair_cost = summary.total_revenue / summary.completed_repairs;
    }

    return summary;
  }

  static async generateRepairCode(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `R${year}${month}`;

    // Get the highest number for today
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT repair_code FROM repairs
       WHERE repair_code LIKE ?
       ORDER BY repair_code DESC
       LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (rows.length > 0) {
      const lastCode = (rows[0] as any).repair_code;
      const lastNumber = parseInt(lastCode.slice(-4));
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  private static async getStartDate(id: number): Promise<Date | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT start_date FROM repairs WHERE id = ?',
      [id]
    );

    return rows.length > 0 ? (rows[0] as any).start_date : null;
  }

  static async existsByAppointment(appointmentId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM repairs WHERE appointment_id = ?',
      [appointmentId]
    );
    return (rows[0] as any).count > 0;
  }

  static async count(filters: RepairSearchFilters = {}): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM repairs r WHERE 1=1';
    const params: any[] = [];

    // Apply same filters as findAll
    if (filters.status) {
      query += ' AND r.status = ?';
      params.push(filters.status);
    }

    if (filters.user_id) {
      query += ' AND r.user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.vehicle_id) {
      query += ' AND r.vehicle_id = ?';
      params.push(filters.vehicle_id);
    }

    if (filters.mechanic_id) {
      query += ' AND r.mechanic_id = ?';
      params.push(filters.mechanic_id);
    }

    if (filters.appointment_id) {
      query += ' AND r.appointment_id = ?';
      params.push(filters.appointment_id);
    }

    if (filters.date_from) {
      query += ' AND DATE(r.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(r.created_at) <= ?';
      params.push(filters.date_to);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return (rows[0] as any).count;
  }
}

export default Repair;