import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';
import Part from './Part';

export interface RepairPartData {
  id?: number;
  repair_id: number;
  part_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  created_at?: Date;

  // Joined data from part
  part_name?: string;
  part_code?: string;
  part_description?: string;
  category_name?: string;
  available_quantity?: number;
}

export class RepairPart {
  private static pool: Pool = db;

  static async create(data: Omit<RepairPartData, 'id' | 'created_at'>): Promise<number> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const { repair_id, part_id, quantity, unit_price, total_price, notes } = data;

      // Check if enough stock is available
      const part = await Part.findById(part_id);
      if (!part) {
        throw new Error('Part not found');
      }

      if (part.current_quantity < quantity) {
        throw new Error(
          `Not enough stock. Available: ${part.current_quantity}, Requested: ${quantity}`
        );
      }

      // Insert repair part record
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO repair_parts (repair_id, part_id, quantity, unit_price, total_price, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [repair_id, part_id, quantity, unit_price, total_price, notes]
      );

      const repairPartId = result.insertId;

      // Update part stock - remove from inventory
      await Part.updateStock(
        part_id,
        part.current_quantity - quantity,
        'out',
        1,
        `Used in repair`,
        unit_price,
        'repair',
        repair_id
      );

      await connection.commit();
      return repairPartId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findByRepairId(repairId: number): Promise<RepairPartData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        rp.*,
        p.name as part_name,
        p.part_code,
        p.description as part_description,
        p.current_quantity as available_quantity,
        pc.name as category_name
       FROM repair_parts rp
       JOIN parts p ON rp.part_id = p.id
       LEFT JOIN part_categories pc ON p.category_id = pc.id
       WHERE rp.repair_id = ?
       ORDER BY rp.created_at`,
      [repairId]
    );

    return rows as RepairPartData[];
  }

  static async findById(id: number): Promise<RepairPartData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        rp.*,
        p.name as part_name,
        p.part_code,
        p.description as part_description,
        p.current_quantity as available_quantity,
        pc.name as category_name
       FROM repair_parts rp
       JOIN parts p ON rp.part_id = p.id
       LEFT JOIN part_categories pc ON p.category_id = pc.id
       WHERE rp.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as RepairPartData) : null;
  }

  static async update(id: number, data: Partial<RepairPartData>): Promise<boolean> {
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
      `UPDATE repair_parts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get repair part info before deletion
      const repairPart = await this.findById(id);
      if (!repairPart) {
        throw new Error('Repair part not found');
      }

      // Return parts to inventory
      const part = await Part.findById(repairPart.part_id);
      if (part) {
        const newQuantity = part.current_quantity + repairPart.quantity;
        await Part.updateStock(
          repairPart.part_id,
          newQuantity,
          'return',
          1,
          `Returned from repair cancellation`,
          repairPart.unit_price,
          'repair',
          repairPart.repair_id
        );
      }

      // Delete repair part record
      const [result] = await connection.execute<ResultSetHeader>(
        'DELETE FROM repair_parts WHERE id = ?',
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

  static async deleteByRepairId(repairId: number): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get all repair parts before deletion
      const repairParts = await this.findByRepairId(repairId);

      // Return all parts to inventory
      for (const repairPart of repairParts) {
        const part = await Part.findById(repairPart.part_id);
        if (part) {
          const newQuantity = part.current_quantity + repairPart.quantity;
          await Part.updateStock(
            repairPart.part_id,
            newQuantity,
            'return',
            1,
            `Returned from repair #${repairId} cancellation`,
            repairPart.unit_price,
            'repair',
            repairId
          );
        }
      }

      // Delete all repair parts
      const [result] = await connection.execute<ResultSetHeader>(
        'DELETE FROM repair_parts WHERE repair_id = ?',
        [repairId]
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

  static async addPart(
    repairId: number,
    partId: number,
    quantity: number,
    customPrice?: number
  ): Promise<number> {
    // Get part details
    const part = await Part.findById(partId);
    if (!part) {
      throw new Error('Part not found');
    }

    if (part.current_quantity < quantity) {
      throw new Error(
        `Not enough stock. Available: ${part.current_quantity}, Requested: ${quantity}`
      );
    }

    const unitPrice = customPrice || part.unit_price;
    const totalPrice = unitPrice * quantity;

    return await this.create({
      repair_id: repairId,
      part_id: partId,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    });
  }

  static async updateQuantity(id: number, newQuantity: number): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const repairPart = await this.findById(id);
      if (!repairPart) {
        throw new Error('Repair part not found');
      }

      const part = await Part.findById(repairPart.part_id);
      if (!part) {
        throw new Error('Part not found');
      }

      const quantityDifference = newQuantity - repairPart.quantity;

      // Check if we have enough stock for increase
      if (quantityDifference > 0 && part.current_quantity < quantityDifference) {
        throw new Error(
          `Not enough stock for increase. Available: ${part.current_quantity}, Needed: ${quantityDifference}`
        );
      }

      // Update stock based on quantity change
      let newStockQuantity;
      let movementType: 'in' | 'out' | 'return';
      let notes: string;

      if (quantityDifference > 0) {
        // Increasing quantity - remove more from stock
        newStockQuantity = part.current_quantity - quantityDifference;
        movementType = 'out';
        notes = `Additional quantity used in repair (${quantityDifference} more)`;
      } else if (quantityDifference < 0) {
        // Decreasing quantity - return to stock
        newStockQuantity = part.current_quantity + Math.abs(quantityDifference);
        movementType = 'return';
        notes = `Quantity reduced in repair (${Math.abs(quantityDifference)} returned)`;
      } else {
        // No change
        await connection.commit();
        return true;
      }

      // Update part stock
      await Part.updateStock(
        repairPart.part_id,
        newStockQuantity,
        movementType,
        1,
        notes,
        repairPart.unit_price,
        'repair',
        repairPart.repair_id
      );

      // Update repair part
      const totalPrice = repairPart.unit_price * newQuantity;
      await this.update(id, {
        quantity: newQuantity,
        total_price: totalPrice,
      });

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updatePrice(id: number, unitPrice: number): Promise<boolean> {
    const repairPart = await this.findById(id);
    if (!repairPart) {
      return false;
    }

    const totalPrice = unitPrice * repairPart.quantity;

    return await this.update(id, {
      unit_price: unitPrice,
      total_price: totalPrice,
    });
  }

  static async getTotalCost(repairId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(SUM(total_price), 0) as total FROM repair_parts WHERE repair_id = ?',
      [repairId]
    );

    return (rows[0] as any).total;
  }

  static async getPartsSummary(repairId: number): Promise<{
    total_parts: number;
    total_cost: number;
    total_quantity: number;
  }> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_parts,
        COALESCE(SUM(total_price), 0) as total_cost,
        COALESCE(SUM(quantity), 0) as total_quantity
       FROM repair_parts
       WHERE repair_id = ?`,
      [repairId]
    );

    const result = rows[0] as any;
    return {
      total_parts: result.total_parts,
      total_cost: result.total_cost,
      total_quantity: result.total_quantity,
    };
  }

  static async getPopularParts(
    limit: number = 10,
    dateFrom?: string,
    dateTo?: string
  ): Promise<
    {
      part_id: number;
      part_name: string;
      part_code: string;
      category_name: string;
      usage_count: number;
      total_quantity_used: number;
      total_revenue: number;
      avg_price: number;
    }[]
  > {
    let query = `
      SELECT
        p.id as part_id,
        p.name as part_name,
        p.part_code,
        pc.name as category_name,
        COUNT(rp.id) as usage_count,
        SUM(rp.quantity) as total_quantity_used,
        SUM(rp.total_price) as total_revenue,
        AVG(rp.unit_price) as avg_price
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      LEFT JOIN part_categories pc ON p.category_id = pc.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(rp.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(rp.created_at) <= ?';
      params.push(dateTo);
    }

    query += `
      GROUP BY p.id, p.name, p.part_code, pc.name
      ORDER BY usage_count DESC, total_quantity_used DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
  }

  static async getPartUsageByCategory(
    dateFrom?: string,
    dateTo?: string
  ): Promise<
    {
      category_name: string;
      part_count: number;
      total_usage: number;
      total_quantity: number;
      total_revenue: number;
    }[]
  > {
    let query = `
      SELECT
        COALESCE(pc.name, 'Không phân loại') as category_name,
        COUNT(DISTINCT p.id) as part_count,
        COUNT(rp.id) as total_usage,
        SUM(rp.quantity) as total_quantity,
        SUM(rp.total_price) as total_revenue
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      LEFT JOIN part_categories pc ON p.category_id = pc.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(rp.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(rp.created_at) <= ?';
      params.push(dateTo);
    }

    query += `
      GROUP BY pc.id, pc.name
      ORDER BY total_revenue DESC
    `;

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as any[];
  }

  static async bulkAddParts(
    repairId: number,
    parts: Array<{
      part_id: number;
      quantity: number;
      custom_price?: number;
      notes?: string;
    }>
  ): Promise<number[]> {
    const connection = await this.pool.getConnection();
    const addedIds: number[] = [];

    try {
      await connection.beginTransaction();

      for (const partData of parts) {
        const id = await this.addPart(
          repairId,
          partData.part_id,
          partData.quantity,
          partData.custom_price
        );

        if (partData.notes) {
          await this.update(id, { notes: partData.notes });
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

  static async checkPartExists(repairId: number, partId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT id FROM repair_parts WHERE repair_id = ? AND part_id = ?',
      [repairId, partId]
    );

    return rows.length > 0;
  }

  static async getStockImpact(repairId: number): Promise<
    {
      part_id: number;
      part_name: string;
      quantity_used: number;
      remaining_stock: number;
      low_stock_warning: boolean;
    }[]
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        p.id as part_id,
        p.name as part_name,
        rp.quantity as quantity_used,
        p.current_quantity as remaining_stock,
        (p.min_stock_level IS NOT NULL AND p.current_quantity <= p.min_stock_level) as low_stock_warning
       FROM repair_parts rp
       JOIN parts p ON rp.part_id = p.id
       WHERE rp.repair_id = ?`,
      [repairId]
    );

    return rows as any[];
  }

  static async validatePartAvailability(
    parts: Array<{ part_id: number; quantity: number }>
  ): Promise<{
    valid: boolean;
    issues: Array<{
      part_id: number;
      part_name: string;
      requested: number;
      available: number;
      shortage: number;
    }>;
  }> {
    const issues: any[] = [];

    for (const partRequest of parts) {
      const part = await Part.findById(partRequest.part_id);
      if (!part) {
        issues.push({
          part_id: partRequest.part_id,
          part_name: 'Unknown Part',
          requested: partRequest.quantity,
          available: 0,
          shortage: partRequest.quantity,
        });
      } else if (part.current_quantity < partRequest.quantity) {
        issues.push({
          part_id: partRequest.part_id,
          part_name: part.name,
          requested: partRequest.quantity,
          available: part.current_quantity,
          shortage: partRequest.quantity - part.current_quantity,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

export default RepairPart;
