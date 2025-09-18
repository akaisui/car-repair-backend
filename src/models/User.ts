import BaseModel from './BaseModel';
import bcrypt from 'bcryptjs';
import { User, CreateUserRequest } from '../types';
import { AppError, isValidEmail } from '../utils';

export default class UserModel extends BaseModel {
  protected static tableName = 'users';

  /**
   * Create new user with password hashing
   */
  static async createUser(userData: CreateUserRequest): Promise<User> {
    const { email, password, full_name, phone, role = 'customer' } = userData;

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      throw new AppError('Invalid email format', 400);
    }

    // Check if user already exists by phone
    const existingUserByPhone = await this.findOne({ phone });
    if (existingUserByPhone) {
      throw new AppError('Số điện thoại này đã được đăng ký', 409);
    }

    // Check if email already exists (if provided)
    if (email) {
      const existingUserByEmail = await this.findOne({ email });
      if (existingUserByEmail) {
        throw new AppError('Email này đã được sử dụng', 409);
      }
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const userWithPassword = await this.create({
      email,
      password: hashedPassword,
      full_name,
      phone,
      role,
      is_active: true,
    });

    // Remove password from response
    const { password: _, ...user } = userWithPassword;
    return user as User;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const user = await this.findOne({ email, is_active: true });
    if (!user) return null;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  /**
   * Find user by phone
   */
  static async findByPhone(phone: string): Promise<User | null> {
    const user = await this.findOne({ phone, is_active: true });
    if (!user) return null;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }

  /**
   * Verify user password
   */
  static async verifyPassword(email: string, password: string): Promise<User | null> {
    // Get user with password field
    const userWithPassword = await this.findOne({ email, is_active: true });
    if (!userWithPassword || !userWithPassword.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordValid) {
      return null;
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userWithPassword;
    return userWithoutPassword as User;
  }

  /**
   * Verify user password by phone
   */
  static async verifyPasswordByPhone(phone: string, password: string): Promise<User | null> {
    // Get user with password field
    const userWithPassword = await this.findOne({ phone, is_active: true });
    if (!userWithPassword || !userWithPassword.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordValid) {
      return null;
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userWithPassword;
    return userWithoutPassword as User;
  }

  /**
   * Update user password
   */
  static async updatePassword(userId: number, newPassword: string): Promise<boolean> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const result = await this.updateById(userId, {
      password: hashedPassword,
    });

    return result !== null;
  }

  /**
   * Get users by role
   */
  static async findByRole(role: string): Promise<User[]> {
    return await this.findAll({
      where: { role, is_active: true },
      orderBy: 'created_at DESC',
    });
  }

  /**
   * Get active staff members
   */
  static async getActiveStaff(): Promise<User[]> {
    const staff = await this.query(
      'SELECT id, email, full_name, phone, role, created_at FROM users WHERE role IN (?, ?) AND is_active = true ORDER BY full_name ASC',
      ['admin', 'staff']
    );
    return staff;
  }

  /**
   * Deactivate user (soft delete)
   */
  static async deactivateUser(userId: number): Promise<boolean> {
    return await this.softDeleteById(userId);
  }

  /**
   * Activate user
   */
  static async activateUser(userId: number): Promise<boolean> {
    const result = await this.updateById(userId, {
      is_active: true,
    });
    return result !== null;
  }

  /**
   * Get user profile with additional info
   */
  static async getUserProfile(userId: number): Promise<any> {
    const user = await this.query(
      `SELECT
        u.id, u.email, u.full_name, u.phone, u.role, u.is_active, u.created_at,
        u.customer_code, u.address, u.loyalty_points, u.total_spent, u.notes
       FROM users u
       WHERE u.id = ? AND u.is_active = true`,
      [userId]
    );

    return Array.isArray(user) && user.length > 0 ? user[0] : null;
  }

  /**
   * Find user by customer code
   */
  static async findByCustomerCode(customerCode: string): Promise<any> {
    return await this.findOne({ customer_code: customerCode, is_active: true });
  }

  /**
   * Get customer vehicles
   */
  static async getCustomerVehicles(userId: number): Promise<any[]> {
    return await this.query(
      `SELECT v.* FROM vehicles v WHERE v.user_id = ? ORDER BY v.created_at DESC`,
      [userId]
    );
  }

  /**
   * Get appointment history
   */
  static async getAppointmentHistory(userId: number, limit: number = 10): Promise<any[]> {
    return await this.query(
      `SELECT a.*, s.name as service_name, v.license_plate
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       LEFT JOIN vehicles v ON a.vehicle_id = v.id
       WHERE a.user_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  /**
   * Get repair history
   */
  static async getRepairHistory(userId: number, limit: number = 10): Promise<any[]> {
    return await this.query(
      `SELECT r.*, v.license_plate, u.full_name as mechanic_name
       FROM repairs r
       LEFT JOIN vehicles v ON r.vehicle_id = v.id
       LEFT JOIN users u ON r.mechanic_id = u.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  /**
   * Get loyalty transactions
   */
  static async getLoyaltyTransactions(userId: number, limit: number = 10): Promise<any[]> {
    return await this.query(
      `SELECT lt.* FROM loyalty_transactions lt
       WHERE lt.user_id = ?
       ORDER BY lt.created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }

  /**
   * Add loyalty points
   */
  static async addLoyaltyPoints(userId: number, points: number, description: string): Promise<boolean> {
    try {
      const user = await this.findById(userId);
      if (!user) return false;

      const newBalance = (user.loyalty_points || 0) + points;

      await this.updateById(userId, { loyalty_points: newBalance });

      // Add transaction record
      await this.query(
        `INSERT INTO loyalty_transactions (user_id, transaction_type, points, balance_after, description)
         VALUES (?, 'earned', ?, ?, ?)`,
        [userId, points, newBalance, description]
      );

      return true;
    } catch (error) {
      console.error('Error adding loyalty points:', error);
      return false;
    }
  }

  /**
   * Redeem loyalty points
   */
  static async redeemLoyaltyPoints(userId: number, points: number, description: string): Promise<boolean> {
    try {
      const user = await this.findById(userId);
      if (!user || (user.loyalty_points || 0) < points) return false;

      const newBalance = (user.loyalty_points || 0) - points;

      await this.updateById(userId, { loyalty_points: newBalance });

      // Add transaction record
      await this.query(
        `INSERT INTO loyalty_transactions (user_id, transaction_type, points, balance_after, description)
         VALUES (?, 'redeemed', ?, ?, ?)`,
        [userId, -points, newBalance, description]
      );

      return true;
    } catch (error) {
      console.error('Error redeeming loyalty points:', error);
      return false;
    }
  }

  /**
   * Update total spent
   */
  static async updateTotalSpent(userId: number, amount: number): Promise<boolean> {
    try {
      const user = await this.findById(userId);
      if (!user) return false;

      const newTotal = (user.total_spent || 0) + amount;
      await this.updateById(userId, { total_spent: newTotal });

      return true;
    } catch (error) {
      console.error('Error updating total spent:', error);
      return false;
    }
  }

  /**
   * Update push token for user
   */
  static async updatePushToken(userId: number, pushToken: string | null, deviceType: string | null): Promise<boolean> {
    try {
      await this.updateById(userId, {
        push_token: pushToken,
        device_type: deviceType
      });

      return true;
    } catch (error) {
      console.error('Error updating push token:', error);
      return false;
    }
  }

  /**
   * Find users by role with push tokens
   */
  static async findByRoleWithPushToken(role: string): Promise<User[]> {
    return this.query(
      'SELECT * FROM users WHERE role = ? AND push_token IS NOT NULL AND is_active = 1',
      [role]
    );
  }

  /**
   * Generate customer code
   */
  static async generateCustomerCode(): Promise<string> {
    const prefix = 'KH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: number, profileData: Partial<User>): Promise<User | null> {
    // Remove sensitive fields that shouldn't be updated through profile update
    const { password, role, is_active, ...allowedFields } = profileData as any;

    if (Object.keys(allowedFields).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Validate email if provided
    if (allowedFields.email && !isValidEmail(allowedFields.email)) {
      throw new AppError('Invalid email format', 400);
    }

    // Check if email is already taken by another user
    if (allowedFields.email) {
      const existingUser = await this.query(
        'SELECT id FROM users WHERE email = ? AND id != ? AND is_active = true',
        [allowedFields.email, userId]
      );

      if (Array.isArray(existingUser) && existingUser.length > 0) {
        throw new AppError('Email đã được sử dụng', 409);
      }
    }

    // Check if phone is already taken by another user
    if (allowedFields.phone) {
      const existingUser = await this.query(
        'SELECT id FROM users WHERE phone = ? AND id != ? AND is_active = true',
        [allowedFields.phone, userId]
      );

      if (Array.isArray(existingUser) && existingUser.length > 0) {
        throw new AppError('Số điện thoại đã được sử dụng', 409);
      }
    }

    return await this.updateById(userId, allowedFields);
  }

  /**
   * Get user statistics
   */
  static async getUserStats(): Promise<any> {
    const stats = await this.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role = 'staff' THEN 1 ELSE 0 END) as staff,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_today
      FROM users
    `);

    return Array.isArray(stats) && stats.length > 0 ? stats[0] : null;
  }
}