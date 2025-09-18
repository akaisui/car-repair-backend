import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface InvoiceData {
  id?: number;
  invoice_number: string;
  repair_id?: number;
  user_id: number;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
  total_amount: number;
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_method?: 'cash' | 'card' | 'transfer' | 'vnpay' | 'momo' | 'other';
  payment_date?: Date;
  due_date?: Date;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;

  // Joined data
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  repair_code?: string;
  vehicle_license_plate?: string;
  vehicle_info?: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id: number;
  item_type: 'service' | 'part';
  item_id: number;
  item_name: string;
  item_code?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InvoiceSearchFilters {
  user_id?: number;
  repair_id?: number;
  payment_status?: string;
  payment_method?: string;
  date_from?: string;
  date_to?: string;
  invoice_number?: string;
  min_amount?: number;
  max_amount?: number;
}

export interface RevenueSummary {
  total_revenue: number;
  paid_revenue: number;
  pending_revenue: number;
  total_invoices: number;
  paid_invoices: number;
  pending_invoices: number;
  avg_invoice_value: number;
  payment_methods: {
    cash: number;
    card: number;
    transfer: number;
    vnpay: number;
    momo: number;
    other: number;
  };
}

export class Invoice {
  private static pool: Pool = db;

  static async create(
    invoiceData: Omit<InvoiceData, 'id' | 'created_at' | 'updated_at'>
  ): Promise<number> {
    // Generate unique invoice number if not provided
    if (!invoiceData.invoice_number) {
      invoiceData.invoice_number = await this.generateInvoiceNumber();
    }

    const {
      invoice_number,
      repair_id,
      user_id,
      subtotal,
      tax_rate = 10, // Default VAT 10%
      tax_amount,
      discount_amount = 0,
      total_amount,
      payment_status = 'pending',
      payment_method,
      payment_date,
      due_date,
      notes,
    } = invoiceData;

    // Calculate tax if not provided
    const calculatedTaxAmount = tax_amount || subtotal * (tax_rate / 100);
    const calculatedTotal = total_amount || subtotal + calculatedTaxAmount - discount_amount;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO invoices
       (invoice_number, repair_id, user_id, subtotal, tax_rate, tax_amount,
        discount_amount, total_amount, payment_status, payment_method, payment_date,
        due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoice_number,
        repair_id,
        user_id,
        subtotal,
        tax_rate,
        calculatedTaxAmount,
        discount_amount,
        calculatedTotal,
        payment_status,
        payment_method,
        payment_date,
        due_date,
        notes,
      ]
    );

    return result.insertId;
  }

  static async findAll(
    filters: InvoiceSearchFilters & {
      limit?: number;
      offset?: number;
      order_by?: string;
      order_direction?: 'ASC' | 'DESC';
    } = {}
  ): Promise<InvoiceData[]> {
    let query = `
      SELECT
        i.*,
        c.full_name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.address as customer_address,
        r.repair_code,
        v.license_plate as vehicle_license_plate,
        CONCAT(v.brand, ' ', v.model, ' (', v.year, ')') as vehicle_info
      FROM invoices i
      JOIN users c ON i.user_id = c.id
      LEFT JOIN repairs r ON i.repair_id = r.id
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // Apply filters
    if (filters.user_id) {
      query += ' AND i.user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.repair_id) {
      query += ' AND i.repair_id = ?';
      params.push(filters.repair_id);
    }

    if (filters.payment_status) {
      query += ' AND i.payment_status = ?';
      params.push(filters.payment_status);
    }

    if (filters.payment_method) {
      query += ' AND i.payment_method = ?';
      params.push(filters.payment_method);
    }

    if (filters.invoice_number) {
      query += ' AND i.invoice_number LIKE ?';
      params.push(`%${filters.invoice_number}%`);
    }

    if (filters.date_from) {
      query += ' AND DATE(i.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(i.created_at) <= ?';
      params.push(filters.date_to);
    }

    if (filters.min_amount) {
      query += ' AND i.total_amount >= ?';
      params.push(filters.min_amount);
    }

    if (filters.max_amount) {
      query += ' AND i.total_amount <= ?';
      params.push(filters.max_amount);
    }

    // Ordering
    const orderBy = filters.order_by || 'created_at';
    const orderDirection = filters.order_direction || 'DESC';
    query += ` ORDER BY i.${orderBy} ${orderDirection}`;

    // Pagination
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset && filters.limit) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return rows as InvoiceData[];
  }

  static async findById(id: number): Promise<InvoiceData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        i.*,
        c.full_name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.address as customer_address,
        r.repair_code,
        r.diagnosis,
        r.work_description,
        v.license_plate as vehicle_license_plate,
        CONCAT(v.brand, ' ', v.model, ' (', v.year, ')') as vehicle_info
       FROM invoices i
       JOIN users c ON i.user_id = c.id
       LEFT JOIN repairs r ON i.repair_id = r.id
       LEFT JOIN vehicles v ON r.vehicle_id = v.id
       WHERE i.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as InvoiceData) : null;
  }

  static async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        i.*,
        c.full_name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        c.address as customer_address,
        r.repair_code,
        v.license_plate as vehicle_license_plate
       FROM invoices i
       JOIN users c ON i.user_id = c.id
       LEFT JOIN repairs r ON i.repair_id = r.id
       LEFT JOIN vehicles v ON r.vehicle_id = v.id
       WHERE i.invoice_number = ?`,
      [invoiceNumber]
    );

    return rows.length > 0 ? (rows[0] as InvoiceData) : null;
  }

  static async findByRepairId(repairId: number): Promise<InvoiceData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM invoices WHERE repair_id = ? ORDER BY created_at DESC LIMIT 1`,
      [repairId]
    );

    return rows.length > 0 ? (rows[0] as InvoiceData) : null;
  }

  static async update(id: number, updateData: Partial<InvoiceData>): Promise<boolean> {
    const allowedFields = [
      'subtotal',
      'tax_rate',
      'tax_amount',
      'discount_amount',
      'total_amount',
      'payment_status',
      'payment_method',
      'payment_date',
      'due_date',
      'notes',
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
      `UPDATE invoices SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  }

  static async updatePaymentStatus(
    id: number,
    payment_status: InvoiceData['payment_status'],
    payment_method?: InvoiceData['payment_method'],
    payment_date?: Date
  ): Promise<boolean> {
    const updateData: any = { payment_status };

    if (payment_method) {
      updateData.payment_method = payment_method;
    }

    if (payment_date) {
      updateData.payment_date = payment_date;
    } else if (payment_status === 'paid') {
      updateData.payment_date = new Date();
    }

    return await this.update(id, updateData);
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM invoices WHERE id = ?', [
      id,
    ]);

    return result.affectedRows > 0;
  }

  static async createFromRepair(
    repairId: number,
    additionalData?: Partial<InvoiceData>
  ): Promise<number> {
    // Get repair details
    const [repairRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        r.*,
        c.id as user_id,
        c.full_name as customer_name
       FROM repairs r
       JOIN users c ON r.user_id = c.id
       WHERE r.id = ?`,
      [repairId]
    );

    if (repairRows.length === 0) {
      throw new Error('Repair not found');
    }

    const repair = repairRows[0] as any;

    // Calculate subtotal from repair costs
    const subtotal = repair.total_cost || 0;
    const tax_rate = additionalData?.tax_rate || 10; // Default 10% VAT
    const tax_amount = subtotal * (tax_rate / 100);
    const discount_amount = additionalData?.discount_amount || repair.discount || 0;
    const total_amount = subtotal + tax_amount - discount_amount;

    // Create invoice
    return await this.create({
      invoice_number: await this.generateInvoiceNumber(),
      repair_id: repairId,
      user_id: repair.user_id,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total_amount,
      payment_status: 'pending',
      due_date: additionalData?.due_date,
      notes: additionalData?.notes,
      ...additionalData,
    });
  }

  static async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    const invoice = await this.findById(invoiceId);
    if (!invoice || !invoice.repair_id) {
      return [];
    }

    // Get services from repair
    const [serviceRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        'service' as item_type,
        s.id as item_id,
        s.name as item_name,
        s.code as item_code,
        rs.quantity,
        rs.unit_price,
        rs.total_price
       FROM repair_services rs
       JOIN services s ON rs.service_id = s.id
       WHERE rs.repair_id = ?`,
      [invoice.repair_id]
    );

    // Get parts from repair
    const [partRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        'part' as item_type,
        p.id as item_id,
        p.name as item_name,
        p.part_code as item_code,
        rp.quantity,
        rp.unit_price,
        rp.total_price
       FROM repair_parts rp
       JOIN parts p ON rp.part_id = p.id
       WHERE rp.repair_id = ?`,
      [invoice.repair_id]
    );

    const items: InvoiceItem[] = [];

    // Add services
    for (const service of serviceRows as any[]) {
      items.push({
        invoice_id: invoiceId,
        item_type: 'service',
        item_id: service.item_id,
        item_name: service.item_name,
        item_code: service.item_code,
        quantity: service.quantity,
        unit_price: service.unit_price,
        total_price: service.total_price,
      });
    }

    // Add parts
    for (const part of partRows as any[]) {
      items.push({
        invoice_id: invoiceId,
        item_type: 'part',
        item_id: part.item_id,
        item_name: part.item_name,
        item_code: part.item_code,
        quantity: part.quantity,
        unit_price: part.unit_price,
        total_price: part.total_price,
      });
    }

    return items;
  }

  static async getRevenueSummary(dateFrom?: string, dateTo?: string): Promise<RevenueSummary> {
    let query = 'SELECT * FROM invoices WHERE 1=1';
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
    const invoices = rows as InvoiceData[];

    const summary: RevenueSummary = {
      total_revenue: 0,
      paid_revenue: 0,
      pending_revenue: 0,
      total_invoices: invoices.length,
      paid_invoices: 0,
      pending_invoices: 0,
      avg_invoice_value: 0,
      payment_methods: {
        cash: 0,
        card: 0,
        transfer: 0,
        vnpay: 0,
        momo: 0,
        other: 0,
      },
    };

    for (const invoice of invoices) {
      summary.total_revenue += invoice.total_amount;

      if (invoice.payment_status === 'paid') {
        summary.paid_revenue += invoice.total_amount;
        summary.paid_invoices++;

        // Count payment methods
        const method = invoice.payment_method || 'other';
        if (method in summary.payment_methods) {
          summary.payment_methods[method as keyof typeof summary.payment_methods] +=
            invoice.total_amount;
        } else {
          summary.payment_methods.other += invoice.total_amount;
        }
      } else if (invoice.payment_status === 'pending') {
        summary.pending_revenue += invoice.total_amount;
        summary.pending_invoices++;
      }
    }

    if (summary.total_invoices > 0) {
      summary.avg_invoice_value = summary.total_revenue / summary.total_invoices;
    }

    return summary;
  }

  static async getMonthlyRevenue(year?: number): Promise<
    {
      month: string;
      revenue: number;
      invoice_count: number;
    }[]
  > {
    const currentYear = year || new Date().getFullYear();

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as revenue,
        COUNT(*) as invoice_count
       FROM invoices
       WHERE YEAR(created_at) = ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month`,
      [currentYear]
    );

    return rows as any[];
  }

  static async getDailyRevenue(days: number = 30): Promise<
    {
      date: string;
      revenue: number;
      invoice_count: number;
    }[]
  > {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as revenue,
        COUNT(*) as invoice_count
       FROM invoices
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [days]
    );

    return rows as any[];
  }

  static async getOverdueInvoices(): Promise<InvoiceData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        i.*,
        c.full_name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        DATEDIFF(CURDATE(), i.due_date) as days_overdue
       FROM invoices i
       JOIN users c ON i.user_id = c.id
       WHERE i.payment_status = 'pending'
       AND i.due_date < CURDATE()
       ORDER BY i.due_date ASC`
    );

    return rows as InvoiceData[];
  }

  static async generateInvoiceNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `INV${year}${month}`;

    // Get the highest number for this month
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT invoice_number FROM invoices
       WHERE invoice_number LIKE ?
       ORDER BY invoice_number DESC
       LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (rows.length > 0) {
      const lastInvoice = (rows[0] as any).invoice_number;
      const lastNumber = parseInt(lastInvoice.slice(-4));
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  static async count(filters: InvoiceSearchFilters = {}): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM invoices i WHERE 1=1';
    const params: any[] = [];

    // Apply same filters as findAll
    if (filters.user_id) {
      query += ' AND i.user_id = ?';
      params.push(filters.user_id);
    }

    if (filters.repair_id) {
      query += ' AND i.repair_id = ?';
      params.push(filters.repair_id);
    }

    if (filters.payment_status) {
      query += ' AND i.payment_status = ?';
      params.push(filters.payment_status);
    }

    if (filters.payment_method) {
      query += ' AND i.payment_method = ?';
      params.push(filters.payment_method);
    }

    if (filters.date_from) {
      query += ' AND DATE(i.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(i.created_at) <= ?';
      params.push(filters.date_to);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    return (rows[0] as any).count;
  }

  static async getUserInvoices(userId: number, limit: number = 20): Promise<InvoiceData[]> {
    return await this.findAll({
      user_id: userId,
      limit,
      order_by: 'created_at',
      order_direction: 'DESC',
    });
  }

  static async getTotalOwed(userId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_amount), 0) as total_owed
       FROM invoices
       WHERE user_id = ?
       AND payment_status IN ('pending', 'partial')`,
      [userId]
    );

    return (rows[0] as any).total_owed;
  }
}

export default Invoice;
