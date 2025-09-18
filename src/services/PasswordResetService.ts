import pool from '../config/database';
import { User } from '../types';
import { AppError } from '../utils';
import JwtService from './JwtService';

interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  is_used: boolean;
  used_at?: Date;
  created_at: Date;
}

export default class PasswordResetService {
  private static readonly TOKEN_EXPIRE_HOURS = 1; // Password reset tokens expire in 1 hour
  private static readonly MAX_TOKENS_PER_HOUR = 3; // Maximum tokens per user per hour

  /**
   * Generate and store password reset token
   */
  static async generateResetToken(user: User): Promise<string> {
    const connection = await pool.getConnection();

    try {
      // Check if user has too many recent reset requests
      await this.checkResetAttemptLimit(user.id);

      // Invalidate any existing unused tokens for this user
      await connection.execute(
        'UPDATE password_reset_tokens SET is_used = true, used_at = NOW() WHERE user_id = ? AND is_used = false',
        [user.id]
      );

      // Generate new token
      const resetToken = JwtService.generatePasswordResetToken(user);

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRE_HOURS);

      // Store token in database
      await connection.execute(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, resetToken, expiresAt]
      );

      return resetToken;
    } finally {
      connection.release();
    }
  }

  /**
   * Verify password reset token and return user info
   */
  static async verifyResetToken(token: string): Promise<{ user: User; tokenId: number }> {
    const connection = await pool.getConnection();

    try {
      // Verify JWT signature and extract payload
      const decoded = JwtService.verifyPasswordResetToken(token);

      // Get stored token info
      const [tokenRows] = await connection.execute(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND is_used = false',
        [token]
      );

      if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
        throw new AppError('Invalid or expired reset token', 400);
      }

      const tokenData = tokenRows[0] as PasswordResetToken;

      // Check if token is expired
      if (new Date() > new Date(tokenData.expires_at)) {
        throw new AppError('Reset token has expired', 400);
      }

      // Get user data
      const [userRows] = await connection.execute(
        'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = ? AND is_active = true',
        [decoded.userId]
      );

      if (!Array.isArray(userRows) || userRows.length === 0) {
        throw new AppError('User not found or inactive', 400);
      }

      const user = userRows[0] as User;

      return { user, tokenId: tokenData.id };
    } finally {
      connection.release();
    }
  }

  /**
   * Reset user password using token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Verify token and get user
      const { user, tokenId } = await this.verifyResetToken(token);

      // Import User model dynamically to avoid circular dependency
      const { default: UserModel } = await import('../models/User');

      // Update user password
      const success = await UserModel.updatePassword(user.id, newPassword);
      if (!success) {
        throw new AppError('Failed to update password', 500);
      }

      // Mark token as used
      await connection.execute(
        'UPDATE password_reset_tokens SET is_used = true, used_at = NOW() WHERE id = ?',
        [tokenId]
      );

      // Revoke all existing refresh tokens for security
      await JwtService.revokeAllUserTokens(user.id);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Check if user has exceeded reset attempt limit
   */
  private static async checkResetAttemptLimit(userId: number): Promise<void> {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        'SELECT COUNT(*) as count FROM password_reset_tokens WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
        [userId]
      );

      const count = (rows as any[])[0].count;
      if (count >= this.MAX_TOKENS_PER_HOUR) {
        throw new AppError('Too many password reset requests. Please try again later.', 429);
      }
    } finally {
      connection.release();
    }
  }

  /**
   * Clean expired password reset tokens
   */
  static async cleanExpiredTokens(): Promise<number> {
    const connection = await pool.getConnection();

    try {
      const [result] = await connection.execute(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR (is_used = true AND used_at < DATE_SUB(NOW(), INTERVAL 24 HOUR))'
      );

      return (result as any).affectedRows || 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Get user's active reset tokens count
   */
  static async getUserActiveTokensCount(userId: number): Promise<number> {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        'SELECT COUNT(*) as count FROM password_reset_tokens WHERE user_id = ? AND is_used = false AND expires_at > NOW()',
        [userId]
      );

      return (rows as any[])[0].count;
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke all user's password reset tokens
   */
  static async revokeAllUserTokens(userId: number): Promise<void> {
    const connection = await pool.getConnection();

    try {
      await connection.execute(
        'UPDATE password_reset_tokens SET is_used = true, used_at = NOW() WHERE user_id = ? AND is_used = false',
        [userId]
      );
    } finally {
      connection.release();
    }
  }
}