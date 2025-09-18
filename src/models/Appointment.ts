import BaseModel from './BaseModel';
import { QueryOptions } from '../types';
import pool from '../config/database';

export interface AppointmentData {
  id?: number;
  appointment_code?: string;
  user_id?: number;
  vehicle_id?: number;
  service_id?: number;
  appointment_date: Date | string;
  appointment_time: string;
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  reminder_sent?: boolean;
  created_at?: Date;
  updated_at?: Date;
  // Joined fields
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  service_name?: string;
  service_duration?: number;
  vehicle_info?: string;
  license_plate?: string;
}

export interface AppointmentFilters {
  user_id?: number;
  vehicle_id?: number;
  service_id?: number;
  status?: string;
  appointment_date?: Date | string;
  date_from?: Date | string;
  date_to?: Date | string;
  search?: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  appointment_id?: number;
  service_duration?: number;
}

export interface CalendarView {
  date: string;
  appointments: AppointmentData[];
  total_appointments: number;
  available_slots: number;
}

/**
 * Appointment Model
 * Manages appointment bookings and scheduling
 */
export default class Appointment extends BaseModel {
  protected static tableName = 'appointments';
  protected static primaryKey = 'id';

  // Business hours configuration
  private static readonly BUSINESS_HOURS = {
    start: '08:00',
    end: '18:00',
    lunch_start: '12:00',
    lunch_end: '13:00',
    slot_duration: 30 // minutes
  };

  private static readonly WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday to Saturday

  /**
   * Create a new appointment
   */
  static async create(data: Omit<AppointmentData, 'id' | 'created_at' | 'updated_at'>): Promise<AppointmentData> {
    // Generate appointment code if not provided
    if (!data.appointment_code) {
      data.appointment_code = await this.generateAppointmentCode();
    }

    // Set default status if not provided
    if (!data.status) {
      data.status = 'pending';
    }

    return await super.create(data);
  }

  /**
   * Update appointment by ID
   */
  static async updateById(id: number, data: Partial<AppointmentData>): Promise<AppointmentData | null> {
    return await super.updateById(id, data);
  }

  /**
   * Find appointment by appointment code
   */
  static async findByAppointmentCode(appointmentCode: string): Promise<AppointmentData | null> {
    return await super.findOne({ appointment_code: appointmentCode });
  }

  /**
   * Find appointment by code with full details (for notifications)
   */
  static async findByCode(appointmentCode: string): Promise<AppointmentData | null> {
    const query = `
      SELECT
        a.*,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.email as customer_email,
        CONCAT(v.brand, ' ', v.model, ' (', v.year, ')') as vehicle_info,
        v.license_plate,
        s.name as service_name,
        s.duration_minutes as service_duration,
        s.price as estimated_cost,
        CASE
          WHEN a.status = 'pending' THEN 'Chờ xác nhận'
          WHEN a.status = 'confirmed' THEN 'Đã xác nhận'
          WHEN a.status = 'in_progress' THEN 'Đang thực hiện'
          WHEN a.status = 'completed' THEN 'Đã hoàn thành'
          WHEN a.status = 'cancelled' THEN 'Đã hủy'
          ELSE a.status
        END as status_label
      FROM appointments a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.appointment_code = ?
    `;

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(query, [appointmentCode]);
      const results = rows as any[];

      if (results.length === 0) {
        return null;
      }

      return results[0];
    } finally {
      connection.release();
    }
  }

  /**
   * Find appointments with full details
   */
  static async findWithDetails(options: QueryOptions = {}): Promise<AppointmentData[]> {
    let query = `
      SELECT
        a.id,
        a.appointment_code,
        a.user_id,
        a.vehicle_id,
        a.service_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        a.reminder_sent,
        a.created_at,
        a.updated_at,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.email as customer_email,
        s.name as service_name,
        s.price as service_price,
        s.duration_minutes as service_duration,
        v.license_plate,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        v.year as vehicle_year
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    // Add WHERE conditions
    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (value !== undefined && value !== null) {
          conditions.push(`a.${key} = ?`);
          params.push(value);
        }
      }
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add ordering
    if (options.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    } else {
      query += ` ORDER BY a.appointment_date DESC, a.appointment_time DESC`;
    }

    // Add pagination using string interpolation (not parameters) to avoid binding issues
    if (options.limit) {
      const limit = parseInt(options.limit.toString());
      if (options.offset && options.offset > 0) {
        const offset = parseInt(options.offset.toString());
        query += ` LIMIT ${offset}, ${limit}`;
      } else {
        query += ` LIMIT ${limit}`;
      }
    }

    return await this.query(query, params);
  }

  /**
   * Search appointments with filters
   */
  static async search(filters: AppointmentFilters, options: QueryOptions = {}): Promise<AppointmentData[]> {
    // Start with basic JOIN query
    let query = `
      SELECT
        a.id,
        a.appointment_code,
        a.user_id,
        a.vehicle_id,
        a.service_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        a.reminder_sent,
        a.created_at,
        a.updated_at,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.email as customer_email,
        s.name as service_name,
        s.price as service_price,
        s.duration_minutes as service_duration,
        v.license_plate,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        v.year as vehicle_year
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Add all filters
    if (filters.user_id) {
      query += ` AND a.user_id = ?`;
      params.push(filters.user_id);
    }

    if (filters.vehicle_id) {
      query += ` AND a.vehicle_id = ?`;
      params.push(filters.vehicle_id);
    }

    if (filters.service_id) {
      query += ` AND a.service_id = ?`;
      params.push(filters.service_id);
    }

    if (filters.status) {
      query += ` AND a.status = ?`;
      params.push(filters.status);
    }

    if (filters.date_from) {
      query += ` AND a.appointment_date >= ?`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ` AND a.appointment_date <= ?`;
      params.push(filters.date_to);
    }

    // Add search functionality
    if (filters.search) {
      query += ` AND (
        u.full_name LIKE ? OR
        u.phone LIKE ? OR
        v.license_plate LIKE ? OR
        s.name LIKE ? OR
        a.appointment_code LIKE ?
      )`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add ordering with fixed column reference
    let orderBy = options.orderBy || 'a.created_at DESC';
    // Ensure column references use table aliases
    orderBy = orderBy.replace(/\bcreated_at\b/g, 'a.created_at');
    orderBy = orderBy.replace(/\bupdated_at\b/g, 'a.updated_at');
    orderBy = orderBy.replace(/\bappointment_date\b/g, 'a.appointment_date');
    query += ` ORDER BY ${orderBy}`;

    // Add pagination using string interpolation (not parameters) to avoid binding issues
    if (options.limit) {
      const limit = parseInt(options.limit.toString());
      if (options.offset && options.offset > 0) {
        const offset = parseInt(options.offset.toString());
        query += ` LIMIT ${offset}, ${limit}`;
      } else {
        query += ` LIMIT ${limit}`;
      }
    } else {
      query += ` LIMIT 10`;
    }

    return await this.query(query, params);
  }

  /**
   * Count appointments with filters
   */
  static async count(filters: AppointmentFilters = {}): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM appointments a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // Apply filters
    if (filters.user_id) {
      query += ` AND a.user_id = ?`;
      params.push(filters.user_id);
    }

    if (filters.vehicle_id) {
      query += ` AND a.vehicle_id = ?`;
      params.push(filters.vehicle_id);
    }

    if (filters.service_id) {
      query += ` AND a.service_id = ?`;
      params.push(filters.service_id);
    }

    if (filters.status) {
      query += ` AND a.status = ?`;
      params.push(filters.status);
    }

    if (filters.appointment_date) {
      query += ` AND DATE(a.appointment_date) = DATE(?)`;
      params.push(filters.appointment_date);
    }

    if (filters.date_from) {
      query += ` AND a.appointment_date >= ?`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ` AND a.appointment_date <= ?`;
      params.push(filters.date_to);
    }

    // Text search
    if (filters.search) {
      query += ` AND (
        u.full_name LIKE ? OR
        u.phone LIKE ? OR
        v.license_plate LIKE ? OR
        s.name LIKE ? OR
        a.appointment_code LIKE ?
      )`;
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const result = await this.query(query, params);
    return result[0]?.count || 0;
  }

  /**
   * Get calendar view for specific date range
   */
  static async getCalendarView(startDate: string, endDate: string, _view: 'day' | 'week' | 'month' = 'month'): Promise<CalendarView[]> {
    const appointments = await this.query(`
      SELECT
        DATE(a.appointment_date) as date,
        a.id,
        a.appointment_code,
        a.user_id,
        a.vehicle_id,
        a.service_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        a.reminder_sent,
        a.created_at,
        a.updated_at,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.email as customer_email,
        s.name as service_name,
        s.price as service_price,
        s.duration_minutes as service_duration,
        v.license_plate,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        v.year as vehicle_year
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.appointment_date BETWEEN ? AND ?
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `, [startDate, endDate]);

    // Group appointments by date
    const groupedByDate: { [key: string]: AppointmentData[] } = {};

    appointments.forEach((appointment: any) => {
      const date = appointment.date;
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(appointment);
    });

    // Generate calendar view
    const calendarView: CalendarView[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayAppointments = groupedByDate[dateStr] || [];

      // Calculate available slots (simplified - assuming 8 hour workday with 30-min slots)
      const totalSlots = this.getTotalDailySlotsCount();
      const usedSlots = dayAppointments.filter(apt => apt.status !== 'cancelled').length;
      const availableSlots = Math.max(0, totalSlots - usedSlots);

      calendarView.push({
        date: dateStr,
        appointments: dayAppointments,
        total_appointments: dayAppointments.length,
        available_slots: availableSlots
      });
    }

    return calendarView;
  }

  /**
   * Check time slot availability
   */
  static async checkTimeSlotAvailability(date: string, time?: string): Promise<TimeSlot[]> {
    // Get existing appointments for the date
    const existingAppointments = await this.query(`
      SELECT appointment_time, service_id, s.duration_minutes
      FROM ${this.tableName} a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE appointment_date = ? AND status NOT IN ('cancelled')
      ORDER BY appointment_time
    `, [date]);

    // Generate all possible time slots for the day
    const allSlots = this.generateDailyTimeSlots();

    // Mark slots as unavailable based on existing appointments
    const availableSlots: TimeSlot[] = allSlots.map(slot => {
      const isAvailable = !this.isSlotConflicting(slot.time, existingAppointments);

      return {
        time: slot.time,
        available: isAvailable
      };
    });

    // If specific time requested, return only that slot
    if (time) {
      return availableSlots.filter(slot => slot.time === time);
    }

    return availableSlots;
  }

  /**
   * Book an appointment with conflict checking
   */
  static async bookAppointment(appointmentData: Omit<AppointmentData, 'id' | 'created_at' | 'updated_at'>): Promise<AppointmentData> {
    // Check if the requested time slot is available
    const availableSlots = await this.checkTimeSlotAvailability(
      appointmentData.appointment_date as string,
      appointmentData.appointment_time
    );

    if (availableSlots.length === 0 || !availableSlots[0].available) {
      throw new Error('The requested time slot is not available');
    }

    // Check if it's a working day
    const appointmentDate = new Date(appointmentData.appointment_date);
    const dayOfWeek = appointmentDate.getDay();

    if (!this.WORKING_DAYS.includes(dayOfWeek)) {
      throw new Error('Appointments can only be booked on working days');
    }

    // Check if appointment is in the future
    const now = new Date();
    const appointmentDateTime = new Date(`${appointmentData.appointment_date}T${appointmentData.appointment_time}`);

    if (appointmentDateTime <= now) {
      throw new Error('Appointments can only be booked for future dates');
    }

    return await this.create(appointmentData);
  }

  /**
   * Update appointment status
   */
  static async updateStatus(appointmentId: number, status: AppointmentData['status'], notes?: string): Promise<AppointmentData | null> {
    const updateData: Partial<AppointmentData> = { status };
    if (notes) {
      updateData.notes = notes;
    }

    return await this.updateById(appointmentId, updateData);
  }

  /**
   * Cancel appointment
   */
  static async cancelAppointment(appointmentId: number, reason?: string): Promise<AppointmentData | null> {
    const notes = reason ? `Cancelled: ${reason}` : 'Appointment cancelled';
    return await this.updateStatus(appointmentId, 'cancelled', notes);
  }

  /**
   * Reschedule appointment
   */
  static async rescheduleAppointment(
    appointmentId: number,
    newDate: string,
    newTime: string,
    reason?: string
  ): Promise<AppointmentData | null> {
    // Check availability of new slot
    const availableSlots = await this.checkTimeSlotAvailability(newDate, newTime);

    if (availableSlots.length === 0 || !availableSlots[0].available) {
      throw new Error('The new time slot is not available');
    }

    const updateData: Partial<AppointmentData> = {
      appointment_date: newDate,
      appointment_time: newTime,
      status: 'confirmed'
    };

    if (reason) {
      updateData.notes = `Rescheduled: ${reason}`;
    }

    return await this.updateById(appointmentId, updateData);
  }

  /**
   * Get appointments requiring reminders
   */
  static async getAppointmentsForReminder(hoursAhead: number = 24): Promise<AppointmentData[]> {
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + hoursAhead);

    return await this.query(`
      SELECT
        a.id,
        a.appointment_code,
        a.user_id,
        a.vehicle_id,
        a.service_id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.notes,
        a.reminder_sent,
        a.created_at,
        a.updated_at,
        u.full_name as customer_name,
        u.phone as customer_phone,
        u.email as customer_email,
        s.name as service_name,
        s.price as service_price,
        v.license_plate,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        v.year as vehicle_year
      FROM ${this.tableName} a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN vehicles v ON a.vehicle_id = v.id
      WHERE a.appointment_date = DATE(?)
        AND a.status IN ('confirmed', 'pending')
        AND a.reminder_sent = false
    `, [reminderTime.toISOString().split('T')[0]]);
  }

  /**
   * Mark reminder as sent
   */
  static async markReminderSent(appointmentId: number): Promise<boolean> {
    const result = await this.updateById(appointmentId, { reminder_sent: true });
    return result !== null;
  }

  /**
   * Get appointment statistics
   */
  static async getStatistics(dateFrom?: string, dateTo?: string): Promise<{
    total: number;
    by_status: Array<{ status: string; count: number }>;
    by_service: Array<{ service_name: string; count: number }>;
    today: number;
    this_week: number;
    this_month: number;
    completion_rate: number;
  }> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay() + 1)).toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    let whereClause = '';
    let params: any[] = [];

    if (dateFrom && dateTo) {
      whereClause = 'WHERE a.appointment_date BETWEEN ? AND ?';
      params = [dateFrom, dateTo];
    }

    const [
      totalResult,
      statusResult,
      serviceResult,
      todayResult,
      weekResult,
      monthResult,
      completionResult
    ] = await Promise.all([
      this.query(`SELECT COUNT(*) as total FROM ${this.tableName} a ${whereClause}`, params),
      this.query(`
        SELECT status, COUNT(*) as count
        FROM ${this.tableName} a ${whereClause}
        GROUP BY status
        ORDER BY count DESC
      `, params),
      this.query(`
        SELECT s.name as service_name, COUNT(*) as count
        FROM ${this.tableName} a
        LEFT JOIN services s ON a.service_id = s.id
        ${whereClause}
        GROUP BY s.id, s.name
        ORDER BY count DESC
        LIMIT 10
      `, params),
      this.query(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE DATE(appointment_date) = DATE(?)`, [today]),
      this.query(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE appointment_date >= ?`, [weekStart]),
      this.query(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE appointment_date >= ?`, [monthStart]),
      this.query(`
        SELECT
          (COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*)) as completion_rate
        FROM ${this.tableName} a ${whereClause}
      `, params)
    ]);

    return {
      total: totalResult[0]?.total || 0,
      by_status: statusResult,
      by_service: serviceResult,
      today: todayResult[0]?.count || 0,
      this_week: weekResult[0]?.count || 0,
      this_month: monthResult[0]?.count || 0,
      completion_rate: completionResult[0]?.completion_rate || 0
    };
  }

  /**
   * Generate appointment code
   */
  static async generateAppointmentCode(): Promise<string> {
    const prefix = 'LH';
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

    const code = `${prefix}${dateStr}${random}`;

    // Check if code already exists
    const existing = await this.findByAppointmentCode(code);
    if (existing) {
      // Recursively generate new code if conflict
      return await this.generateAppointmentCode();
    }

    return code;
  }

  /**
   * Generate daily time slots
   */
  private static generateDailyTimeSlots(): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const startTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const endTime = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.BUSINESS_HOURS.lunch_start);
    const lunchEnd = this.timeToMinutes(this.BUSINESS_HOURS.lunch_end);

    for (let time = startTime; time < endTime; time += this.BUSINESS_HOURS.slot_duration) {
      // Skip lunch break
      if (time >= lunchStart && time < lunchEnd) {
        continue;
      }

      slots.push({
        time: this.minutesToTime(time),
        available: true
      });
    }

    return slots;
  }

  /**
   * Check if a time slot conflicts with existing appointments
   */
  private static isSlotConflicting(slotTime: string, existingAppointments: any[]): boolean {
    const slotMinutes = this.timeToMinutes(slotTime);

    return existingAppointments.some(apt => {
      const aptMinutes = this.timeToMinutes(apt.appointment_time);
      const aptDuration = apt.duration_minutes || 30;

      // Check if slot overlaps with appointment
      return (
        slotMinutes >= aptMinutes &&
        slotMinutes < aptMinutes + aptDuration
      );
    });
  }

  /**
   * Convert time string to minutes
   */
  private static timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes to time string
   */
  private static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Get total daily slots count
   */
  private static getTotalDailySlotsCount(): number {
    const startTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const endTime = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.BUSINESS_HOURS.lunch_start);
    const lunchEnd = this.timeToMinutes(this.BUSINESS_HOURS.lunch_end);

    const totalMinutes = (endTime - startTime) - (lunchEnd - lunchStart);
    return Math.floor(totalMinutes / this.BUSINESS_HOURS.slot_duration);
  }
}