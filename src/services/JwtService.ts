import { JwtPayload, User } from '../types';
import { AppError } from '../utils';
import pool from '../config/database';
const jwt = require('jsonwebtoken');

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RefreshTokenData {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  created_at: Date;
  is_active: boolean;
}

export default class JwtService {
  private static readonly ACCESS_TOKEN_EXPIRE = process.env.JWT_EXPIRE || '15m';
  private static readonly REFRESH_TOKEN_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

  /**
   * Generate access token
   */
  static generateAccessToken(user: User): string {
    if (!process.env.JWT_SECRET) {
      throw new AppError('JWT secret not configured', 500);
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRE,
      issuer: 'car-repair-api',
      audience: 'car-repair-app',
    });
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user: User): string {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new AppError('JWT refresh secret not configured', 500);
    }

    const payload = {
      userId: user.id,
      email: user.email,
      type: 'refresh',
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRE,
      issuer: 'car-repair-api',
      audience: 'car-repair-app',
    });
  }

  /**
   * Generate token pair (access + refresh)
   */
  static async generateTokenPair(user: User): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Store refresh token in database
    await this.storeRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): JwtPayload {
    if (!process.env.JWT_SECRET) {
      throw new AppError('JWT secret not configured', 500);
    }

    try {
      return jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'car-repair-api',
        audience: 'car-repair-app',
      }) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Access token expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid access token', 401);
      }
      throw new AppError('Token verification failed', 401);
    }
  }

  /**
   * Verify refresh token
   */
  static async verifyRefreshToken(token: string): Promise<{ userId: number; email: string }> {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new AppError('JWT refresh secret not configured', 500);
    }

    try {
      // Verify JWT signature and expiration
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: 'car-repair-api',
        audience: 'car-repair-app',
      }) as any;

      // Check if refresh token exists and is active in database
      const storedToken = await this.getStoredRefreshToken(token);
      if (!storedToken || !storedToken.is_active) {
        throw new AppError('Refresh token is invalid or revoked', 401);
      }

      // Check if token is expired
      if (new Date() > new Date(storedToken.expires_at)) {
        await this.revokeRefreshToken(token);
        throw new AppError('Refresh token expired', 401);
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof jwt.TokenExpiredError) {
        await this.revokeRefreshToken(token);
        throw new AppError('Refresh token expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid refresh token', 401);
      }
      throw new AppError('Refresh token verification failed', 401);
    }
  }

  /**
   * Store refresh token in database
   */
  static async storeRefreshToken(userId: number, token: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + this.getRefreshTokenTTL());

      // First, revoke any existing active refresh tokens for this user
      await connection.execute(
        'UPDATE refresh_tokens SET is_active = false WHERE user_id = ? AND is_active = true',
        [userId]
      );

      // Store new refresh token
      await connection.execute(
        'INSERT INTO refresh_tokens (user_id, token, expires_at, is_active) VALUES (?, ?, ?, true)',
        [userId, token, expiresAt]
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Get stored refresh token
   */
  static async getStoredRefreshToken(token: string): Promise<RefreshTokenData | null> {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM refresh_tokens WHERE token = ? LIMIT 1',
        [token]
      );

      return Array.isArray(rows) && rows.length > 0 ? (rows[0] as RefreshTokenData) : null;
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(token: string): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.execute('UPDATE refresh_tokens SET is_active = false WHERE token = ?', [
        token,
      ]);
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke all user refresh tokens
   */
  static async revokeAllUserTokens(userId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.execute('UPDATE refresh_tokens SET is_active = false WHERE user_id = ?', [
        userId,
      ]);
    } finally {
      connection.release();
    }
  }

  /**
   * Clean expired refresh tokens
   */
  static async cleanExpiredTokens(): Promise<number> {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.execute(
        'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR is_active = false'
      );

      return (result as any).affectedRows || 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Get refresh token TTL in milliseconds
   */
  private static getRefreshTokenTTL(): number {
    const expire = process.env.JWT_REFRESH_EXPIRE || '7d';

    // Parse time string (e.g., "7d", "24h", "60m")
    const match = expire.match(/^(\d+)([dhms])$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'm':
        return value * 60 * 1000;
      case 's':
        return value * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Create password reset token
   */
  static generatePasswordResetToken(user: User): string {
    if (!process.env.JWT_SECRET) {
      throw new AppError('JWT secret not configured', 500);
    }

    const payload = {
      userId: user.id,
      email: user.email,
      type: 'password_reset',
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h', // Password reset tokens expire in 1 hour
      issuer: 'car-repair-api',
      audience: 'car-repair-app',
    });
  }

  /**
   * Verify password reset token
   */
  static verifyPasswordResetToken(token: string): { userId: number; email: string } {
    if (!process.env.JWT_SECRET) {
      throw new AppError('JWT secret not configured', 500);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'car-repair-api',
        audience: 'car-repair-app',
      }) as any;

      if (decoded.type !== 'password_reset') {
        throw new AppError('Invalid token type', 401);
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Password reset token expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid password reset token', 401);
      }
      throw new AppError('Token verification failed', 401);
    }
  }
}
