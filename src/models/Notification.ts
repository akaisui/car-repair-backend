import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../config/database';

export interface NotificationData {
  id?: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data?: any;
  is_read?: boolean;
  read_at?: Date;
  created_at?: Date;
}

export interface NotificationFilters {
  user_id?: number;
  type?: string;
  is_read?: boolean;
  limit?: number;
  offset?: number;
}

export class Notification {
  private static pool: Pool = db;

  static async create(data: Omit<NotificationData, 'id' | 'created_at'>): Promise<number> {
    const {
      user_id,
      type,
      title,
      message,
      data: notificationData,
      is_read = false
    } = data;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO notifications (user_id, type, title, message, data, is_read)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, type, title, message, notificationData ? JSON.stringify(notificationData) : null, is_read]
    );

    return result.insertId;
  }

  static async findByUserId(userId: number, filters: NotificationFilters = {}): Promise<NotificationData[]> {
    let query = `
      SELECT id, user_id, type, title, message, data, is_read, read_at, created_at
      FROM notifications
      WHERE user_id = ?
    `;
    const params: any[] = [userId];

    // Apply additional filters
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.is_read !== undefined) {
      query += ' AND is_read = ?';
      params.push(filters.is_read);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit && filters.limit > 0) {
      const limit = parseInt(filters.limit.toString());
      if (filters.offset && filters.offset > 0) {
        const offset = parseInt(filters.offset.toString());
        query += ` LIMIT ${offset}, ${limit}`;
      } else {
        query += ` LIMIT ${limit}`;
      }
    }

    const [rows] = await this.pool.execute<RowDataPacket[]>(query, params);

    return rows.map(row => {
      let parsedData = null;
      if (row.data) {
        try {
          // Handle case where data might be a string or already an object
          if (typeof row.data === 'string') {
            parsedData = JSON.parse(row.data);
          } else if (typeof row.data === 'object') {
            parsedData = row.data;
          }
        } catch (error) {
          console.error('Failed to parse notification data:', row.data, error);
          parsedData = null;
        }
      }

      return {
        ...row,
        data: parsedData,
        is_read: Boolean(row.is_read)
      };
    }) as NotificationData[];
  }

  static async findById(id: number): Promise<NotificationData | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    let parsedData = null;
    if (row.data) {
      try {
        if (typeof row.data === 'string') {
          parsedData = JSON.parse(row.data);
        } else if (typeof row.data === 'object') {
          parsedData = row.data;
        }
      } catch (error) {
        console.error('Failed to parse notification data:', row.data, error);
        parsedData = null;
      }
    }

    return {
      ...row,
      data: parsedData,
      is_read: Boolean(row.is_read)
    } as NotificationData;
  }

  static async markAsRead(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async markAllAsRead(userId: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    return result.affectedRows > 0;
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM notifications WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async getUnreadCount(userId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    return (rows[0] as any).count;
  }

  static async getRecentNotifications(userId: number, limit: number = 10): Promise<NotificationData[]> {
    return this.findByUserId(userId, { limit });
  }

  // Specific notification creators
  static async createAppointmentConfirmed(userId: number, appointmentCode: string, repairCode?: string): Promise<number> {
    const title = '✅ Lịch hẹn đã được xác nhận';
    const message = `Lịch hẹn #${appointmentCode} của bạn đã được xác nhận. ${repairCode ? `Phiếu sửa chữa #${repairCode} đã được tạo.` : ''}`;

    return this.create({
      user_id: userId,
      type: 'appointment_confirmed',
      title,
      message,
      data: {
        appointment_code: appointmentCode,
        repair_code: repairCode,
        action_url: repairCode ? `/dashboard/repairs` : `/dashboard/appointments`
      }
    });
  }

  static async createRepairStatusUpdate(userId: number, repairCode: string, status: string, statusLabel: string): Promise<number> {
    const title = '🔧 Cập nhật tiến độ sửa chữa';
    const message = `Phiếu sửa chữa #${repairCode} đã được cập nhật trạng thái: ${statusLabel}`;

    return this.create({
      user_id: userId,
      type: 'repair_status_update',
      title,
      message,
      data: {
        repair_code: repairCode,
        status,
        status_label: statusLabel,
        action_url: `/dashboard/repairs`
      }
    });
  }

  static async createRepairCompleted(userId: number, repairCode: string): Promise<number> {
    const title = '🎉 Xe đã sửa xong!';
    const message = `Phiếu sửa chữa #${repairCode} đã hoàn thành. Vui lòng liên hệ để nhận xe.`;

    return this.create({
      user_id: userId,
      type: 'repair_completed',
      title,
      message,
      data: {
        repair_code: repairCode,
        action_url: `/dashboard/repairs`,
        urgent: true
      }
    });
  }

  static async createAppointmentCancelled(userId: number, appointmentCode: string, reason?: string): Promise<number> {
    const title = '❌ Lịch hẹn đã bị hủy';
    const message = `Lịch hẹn #${appointmentCode} đã bị hủy. ${reason ? `Lý do: ${reason}` : ''}`;

    return this.create({
      user_id: userId,
      type: 'appointment_cancelled',
      title,
      message,
      data: {
        appointment_code: appointmentCode,
        reason,
        action_url: `/dashboard/appointments`
      }
    });
  }
}

export default Notification;