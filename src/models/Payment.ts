import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface PaymentData {
  id?: number;
  invoice_id: number;
  transaction_id?: string;
  payment_method: 'cash' | 'card' | 'transfer' | 'vnpay' | 'momo' | 'other';
  amount: number;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'refunded';
  gateway_response?: string;
  gateway_transaction_id?: string;
  payment_date?: Date;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;

  // Joined data
  invoice_number?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface PaymentSearchFilters {
  invoice_id?: number;
  payment_method?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  transaction_id?: string;
  min_amount?: number;
  max_amount?: number;
}

export class Payment {
  private static pool: Pool = db;

  static async create(
    paymentData: Omit<PaymentData, 'id' | 'created_at' | 'updated_at'>
  ): Promise<number> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        invoice_id,
        transaction_id,
        payment_method,
        amount,
        status = 'pending',
        gateway_response,
        gateway_transaction_id,
        payment_date,
        notes,
      } = paymentData;

      // Generate unique transaction ID if not provided
      const finalTransactionId = transaction_id || this.generateTransactionId();

      // Insert payment record
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO payments
         (invoice_id, transaction_id, payment_method, amount, status,
          gateway_response, gateway_transaction_id, payment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice_id,
          finalTransactionId,
          payment_method,
          amount,
          status,
          gateway_response,
          gateway_transaction_id,
          payment_date,
          notes,
        ]
      );

      const paymentId = result.insertId;

      // Update invoice payment status if payment is successful
      if (status === 'success') {
        // Get current invoice details
        const [invoiceRows] = await connection.execute<RowDataPacket[]>(
          'SELECT total_amount, payment_status FROM invoices WHERE id = ?',
          [invoice_id]
        );

        if (invoiceRows.length > 0) {
          const invoice = invoiceRows[0] as any;

          // Get total payments for this invoice
          const [paymentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(amount), 0) as total_paid
             FROM payments
             WHERE invoice_id = ? AND status = 'success'`,
            [invoice_id]
          );

          const totalPaid = (paymentRows[0] as any).total_paid;

          // Determine new payment status
          let newPaymentStatus = 'pending';
          if (totalPaid >= invoice.total_amount) {
            newPaymentStatus = 'paid';
          } else if (totalPaid > 0) {
            newPaymentStatus = 'partial';
          }

          // Update invoice
          await connection.execute(
            `UPDATE invoices
             SET payment_status = ?, payment_method = ?, payment_date = ?
             WHERE id = ?`,
            [newPaymentStatus, payment_method, payment_date || new Date(), invoice_id]
          );
        }
      }

      await connection.commit();
      return paymentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findAll(
    filters: PaymentSearchFilters & {
      limit?: number;
      offset?: number;
      order_by?: string;
      order_direction?: 'ASC' | 'DESC';
    } = {}
  ): Promise<PaymentData[]> {
    let query = `
      SELECT
        p.*,
        i.invoice_number,
        c.full_name as customer_name,
        c.phone as customer_phone
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // Apply filters
    if (filters.invoice_id) {
      query += ' AND p.invoice_id = ?';
      params.push(filters.invoice_id);
    }

    if (filters.payment_method) {
      query += ' AND p.payment_method = ?';
      params.push(filters.payment_method);
    }

    if (filters.status) {
      query += ' AND p.status = ?';
      params.push(filters.status);
    }

    if (filters.transaction_id) {
      query += ' AND p.transaction_id = ?';
      params.push(filters.transaction_id);
    }

    if (filters.date_from) {
      query += ' AND DATE(p.payment_date) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(p.payment_date) <= ?';
      params.push(filters.date_to);
    }

    if (filters.min_amount) {
      query += ' AND p.amount >= ?';
      params.push(filters.min_amount);
    }

    if (filters.max_amount) {
      query += ' AND p.amount <= ?';
      params.push(filters.max_amount);
    }

    // Ordering
    const orderBy = filters.order_by || 'created_at';
    const orderDirection = filters.order_direction || 'DESC';
    query += ` ORDER BY p.${orderBy} ${orderDirection}`;

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
    return rows as PaymentData[];
  }

  static async findById(id: number): Promise<PaymentData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        p.*,
        i.invoice_number,
        c.full_name as customer_name,
        c.phone as customer_phone
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       JOIN customers c ON i.customer_id = c.id
       WHERE p.id = ?`,
      [id]
    );

    return rows.length > 0 ? (rows[0] as PaymentData) : null;
  }

  static async findByTransactionId(transactionId: string): Promise<PaymentData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT
        p.*,
        i.invoice_number,
        c.full_name as customer_name,
        c.phone as customer_phone
       FROM payments p
       JOIN invoices i ON p.invoice_id = i.id
       JOIN customers c ON i.customer_id = c.id
       WHERE p.transaction_id = ?`,
      [transactionId]
    );

    return rows.length > 0 ? (rows[0] as PaymentData) : null;
  }

  static async findByInvoiceId(invoiceId: number): Promise<PaymentData[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM payments
       WHERE invoice_id = ?
       ORDER BY created_at DESC`,
      [invoiceId]
    );

    return rows as PaymentData[];
  }

  static async update(id: number, updateData: Partial<PaymentData>): Promise<boolean> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const allowedFields = [
        'status',
        'gateway_response',
        'gateway_transaction_id',
        'payment_date',
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
        await connection.commit();
        return false;
      }

      values.push(id);

      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE payments SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      // If status changed to success, update invoice
      if (updateData.status === 'success') {
        const payment = await this.findById(id);
        if (payment) {
          await this.updateInvoicePaymentStatus(connection, payment.invoice_id);
        }
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateStatus(
    id: number,
    status: PaymentData['status'],
    gatewayResponse?: string
  ): Promise<boolean> {
    const updateData: any = { status };
    if (gatewayResponse) {
      updateData.gateway_response = gatewayResponse;
    }
    if (status === 'success') {
      updateData.payment_date = new Date();
    }

    return await this.update(id, updateData);
  }

  static async processRefund(paymentId: number, amount?: number, notes?: string): Promise<number> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get original payment
      const [paymentRows] = await connection.execute<RowDataPacket[]>(
        'SELECT * FROM payments WHERE id = ? AND status = ?',
        [paymentId, 'success']
      );

      if (paymentRows.length === 0) {
        throw new Error('Payment not found or not successful');
      }

      const originalPayment = paymentRows[0] as PaymentData;
      const refundAmount = amount || originalPayment.amount;

      // Create refund payment record
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO payments
         (invoice_id, transaction_id, payment_method, amount, status, notes, payment_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          originalPayment.invoice_id,
          this.generateTransactionId('REF'),
          originalPayment.payment_method,
          -refundAmount, // Negative amount for refund
          'refunded',
          notes || `Refund for payment ${originalPayment.transaction_id}`,
          new Date(),
        ]
      );

      const refundId = result.insertId;

      // Update original payment status
      await connection.execute('UPDATE payments SET status = ? WHERE id = ?', [
        'refunded',
        paymentId,
      ]);

      // Update invoice payment status
      await this.updateInvoicePaymentStatus(connection, originalPayment.invoice_id);

      await connection.commit();
      return refundId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private static async updateInvoicePaymentStatus(
    connection: PoolConnection,
    invoiceId: number
  ): Promise<void> {
    // Get invoice details
    const [invoiceRows] = await connection.execute<RowDataPacket[]>(
      'SELECT total_amount FROM invoices WHERE id = ?',
      [invoiceId]
    );

    if (invoiceRows.length === 0) return;

    const invoice = invoiceRows[0] as any;

    // Get total successful payments
    const [paymentRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM payments
       WHERE invoice_id = ? AND status = 'success'`,
      [invoiceId]
    );

    const totalPaid = (paymentRows[0] as any).total_paid;

    // Determine payment status
    let paymentStatus = 'pending';
    if (totalPaid >= invoice.total_amount) {
      paymentStatus = 'paid';
    } else if (totalPaid > 0 && totalPaid < invoice.total_amount) {
      paymentStatus = 'partial';
    } else if (totalPaid < 0) {
      paymentStatus = 'refunded';
    }

    // Update invoice
    await connection.execute('UPDATE invoices SET payment_status = ? WHERE id = ?', [
      paymentStatus,
      invoiceId,
    ]);
  }

  static async getTotalPayments(invoiceId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) as total_paid
       FROM payments
       WHERE invoice_id = ? AND status = 'success'`,
      [invoiceId]
    );

    return (rows[0] as any).total_paid;
  }

  static async getPaymentSummary(
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    total_payments: number;
    successful_payments: number;
    failed_payments: number;
    pending_payments: number;
    total_amount: number;
    payment_methods: { [key: string]: number };
  }> {
    let query = 'SELECT * FROM payments WHERE 1=1';
    const params: any[] = [];

    if (dateFrom) {
      query += ' AND DATE(payment_date) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND DATE(payment_date) <= ?';
      params.push(dateTo);
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);
    const payments = rows as PaymentData[];

    const summary = {
      total_payments: payments.length,
      successful_payments: 0,
      failed_payments: 0,
      pending_payments: 0,
      total_amount: 0,
      payment_methods: {} as { [key: string]: number },
    };

    for (const payment of payments) {
      if (payment.status === 'success') {
        summary.successful_payments++;
        summary.total_amount += payment.amount;

        // Count by payment method
        const method = payment.payment_method;
        summary.payment_methods[method] = (summary.payment_methods[method] || 0) + payment.amount;
      } else if (payment.status === 'failed') {
        summary.failed_payments++;
      } else if (payment.status === 'pending' || payment.status === 'processing') {
        summary.pending_payments++;
      }
    }

    return summary;
  }

  static generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM payments WHERE id = ?', [
      id,
    ]);

    return result.affectedRows > 0;
  }
}

// Create payments table if not exists
export async function createPaymentsTable(): Promise<void> {
  const connection = await db.getConnection();

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        invoice_id INT NOT NULL,
        transaction_id VARCHAR(100) UNIQUE NOT NULL,
        payment_method ENUM('cash', 'card', 'transfer', 'vnpay', 'momo', 'other') NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status ENUM('pending', 'processing', 'success', 'failed', 'refunded') DEFAULT 'pending',
        gateway_response TEXT,
        gateway_transaction_id VARCHAR(255),
        payment_date DATETIME,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_invoice_id (invoice_id),
        INDEX idx_status (status),
        INDEX idx_payment_date (payment_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Payments table created or already exists');
  } finally {
    connection.release();
  }
}

export default Payment;
