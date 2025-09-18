import { User } from '../models';
import { AppError } from '../utils';
import JwtService from './JwtService';
import PasswordResetService from './PasswordResetService';
import EmailService from './EmailService';
import pool from '../config/database';
import { LoginRequest, CreateUserRequest, AuthResponse } from '../types';

interface ChangePasswordRequest {
  userId: number;
  currentPassword: string;
  newPassword: string;
}

interface LoginAttempt {
  email: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
}

export default class AuthService {
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MINUTES = 30;

  /**
   * Authenticate user with email and password
   */
  static async login(
    loginData: LoginRequest,
    ipAddress: string,
    userAgent?: string
  ): Promise<AuthResponse> {
    const { email, password } = loginData;

    // Check for too many failed attempts
    await this.checkLoginAttempts(email, ipAddress);

    // Verify credentials
    const user = await User.verifyPassword(email, password);
    if (!user) {
      // Log failed attempt
      await this.logLoginAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
      });
      throw new AppError('Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.is_active) {
      throw new AppError('Account is deactivated', 403);
    }

    // Generate tokens
    const tokens = await JwtService.generateTokenPair(user);

    // Log successful attempt
    await this.logLoginAttempt({
      email,
      ipAddress,
      userAgent,
      success: true,
    });

    // Clear any existing failed attempts
    await this.clearFailedAttempts(email, ipAddress);

    return {
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Register new user
   */
  static async register(userData: CreateUserRequest): Promise<AuthResponse> {
    // Create user with default customer role
    const user = await User.createUser({
      ...userData,
      role: userData.role || 'customer',
    });

    // Generate tokens
    const tokens = await JwtService.generateTokenPair(user);

    // Send welcome email (don't fail if email service is not configured)
    try {
      await EmailService.sendWelcomeEmail(user.email, {
        userName: user.full_name,
        loginLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`,
      });
    } catch (error) {
      console.warn('Failed to send welcome email:', error);
    }

    return {
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{ token: string; user: any }> {
    // Verify refresh token
    const decoded = await JwtService.verifyRefreshToken(refreshToken);

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user || !user.is_active) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Generate new access token
    const newAccessToken = JwtService.generateAccessToken(user);

    return {
      token: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    };
  }

  /**
   * Logout user by revoking refresh token
   */
  static async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      try {
        await JwtService.revokeRefreshToken(refreshToken);
      } catch (error) {
        console.warn('Failed to revoke refresh token during logout:', error);
      }
    }
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return;
    }

    // Generate reset token
    const resetToken = await PasswordResetService.generateResetToken(user);

    // Create reset link
    const resetLink = `${
      process.env.FRONTEND_URL || 'http://localhost:3000'
    }/reset-password?token=${resetToken}`;

    // Send reset email
    await EmailService.sendPasswordResetEmail(user.email, {
      userName: user.full_name,
      resetLink,
      expiryHours: 1,
    });
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    await PasswordResetService.resetPassword(token, newPassword);
  }

  /**
   * Verify password reset token
   */
  static async verifyResetToken(token: string): Promise<{ user: any; valid: boolean }> {
    try {
      const { user } = await PasswordResetService.verifyResetToken(token);
      return { user, valid: true };
    } catch (error) {
      return { user: null, valid: false };
    }
  }

  /**
   * Change user password (authenticated)
   */
  static async changePassword(request: ChangePasswordRequest): Promise<void> {
    const { userId, currentPassword, newPassword } = request;

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await User.verifyPassword(user.email, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Update password
    const success = await User.updatePassword(userId, newPassword);
    if (!success) {
      throw new AppError('Failed to update password', 500);
    }

    // Revoke all refresh tokens for security
    await JwtService.revokeAllUserTokens(userId);
  }

  /**
   * Get user profile with additional info
   */
  static async getUserProfile(userId: number): Promise<any> {
    const profile = await User.getUserProfile(userId);
    if (!profile) {
      throw new AppError('User profile not found', 404);
    }
    return profile;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: number, profileData: any): Promise<any> {
    const updatedUser = await User.updateProfile(userId, profileData);
    if (!updatedUser) {
      throw new AppError('Failed to update profile', 500);
    }
    return updatedUser;
  }

  /**
   * Check login attempts to prevent brute force
   */
  private static async checkLoginAttempts(email: string, ipAddress: string): Promise<void> {
    const connection = await pool.getConnection();

    try {
      // Check failed attempts in the last LOCKOUT_DURATION_MINUTES
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as failed_count
         FROM login_attempts
         WHERE (email = ? OR ip_address = ?)
           AND success = false
           AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
        [email, ipAddress, this.LOCKOUT_DURATION_MINUTES]
      );

      const failedCount = (rows as any[])[0]?.failed_count || 0;

      if (failedCount >= this.MAX_LOGIN_ATTEMPTS) {
        throw new AppError(
          `Too many failed login attempts. Please try again after ${this.LOCKOUT_DURATION_MINUTES} minutes.`,
          429
        );
      }
    } finally {
      connection.release();
    }
  }

  /**
   * Log login attempt
   */
  private static async logLoginAttempt(attempt: LoginAttempt): Promise<void> {
    const connection = await pool.getConnection();

    try {
      await connection.execute(
        `INSERT INTO login_attempts (email, ip_address, user_agent, success, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [attempt.email, attempt.ipAddress, attempt.userAgent || '', attempt.success]
      );
    } catch (error) {
      // Log error but don't fail the login process
      console.error('Failed to log login attempt:', error);
    } finally {
      connection.release();
    }
  }

  /**
   * Clear failed login attempts for email/IP
   */
  private static async clearFailedAttempts(email: string, ipAddress: string): Promise<void> {
    const connection = await pool.getConnection();

    try {
      await connection.execute(
        `DELETE FROM login_attempts
         WHERE (email = ? OR ip_address = ?) AND success = false`,
        [email, ipAddress]
      );
    } catch (error) {
      // Log error but don't fail the process
      console.error('Failed to clear failed attempts:', error);
    } finally {
      connection.release();
    }
  }

  /**
   * Get user session info
   */
  static async getUserSessions(userId: number): Promise<any[]> {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        `SELECT id, expires_at, created_at, is_active
         FROM refresh_tokens
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      );

      return rows as any[];
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke specific user session
   */
  static async revokeUserSession(userId: number, tokenId: number): Promise<void> {
    const connection = await pool.getConnection();

    try {
      const [result] = await connection.execute(
        `UPDATE refresh_tokens
         SET is_active = false
         WHERE id = ? AND user_id = ?`,
        [tokenId, userId]
      );

      if ((result as any).affectedRows === 0) {
        throw new AppError('Session not found', 404);
      }
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke all user sessions except current
   */
  static async revokeOtherUserSessions(userId: number, currentTokenId?: number): Promise<void> {
    const connection = await pool.getConnection();

    try {
      let query = `UPDATE refresh_tokens SET is_active = false WHERE user_id = ?`;
      const params: any[] = [userId];

      if (currentTokenId) {
        query += ` AND id != ?`;
        params.push(currentTokenId);
      }

      await connection.execute(query, params);
    } finally {
      connection.release();
    }
  }

  /**
   * Cleanup expired tokens and login attempts
   */
  static async cleanup(): Promise<{ tokensDeleted: number; attemptsDeleted: number }> {
    const connection = await pool.getConnection();

    try {
      // Clean expired refresh tokens
      const tokensDeleted = await JwtService.cleanExpiredTokens();

      // Clean expired password reset tokens
      await PasswordResetService.cleanExpiredTokens();

      // Clean old login attempts (older than 7 days)
      const [attemptResult] = await connection.execute(
        `DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );
      const attemptsDeleted = (attemptResult as any).affectedRows || 0;

      return { tokensDeleted, attemptsDeleted };
    } finally {
      connection.release();
    }
  }

  /**
   * Get authentication statistics
   */
  static async getAuthStats(): Promise<any> {
    const connection = await pool.getConnection();

    try {
      const [stats] = await connection.execute(`
        SELECT
          (SELECT COUNT(*) FROM refresh_tokens WHERE is_active = true) as active_sessions,
          (SELECT COUNT(*) FROM refresh_tokens WHERE expires_at > NOW()) as valid_tokens,
          (SELECT COUNT(*) FROM login_attempts WHERE success = true AND DATE(created_at) = CURDATE()) as successful_logins_today,
          (SELECT COUNT(*) FROM login_attempts WHERE success = false AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) as failed_attempts_last_hour,
          (SELECT COUNT(*) FROM password_reset_tokens WHERE is_used = false AND expires_at > NOW()) as active_reset_tokens
      `);

      return Array.isArray(stats) && stats.length > 0 ? stats[0] : {};
    } finally {
      connection.release();
    }
  }
}