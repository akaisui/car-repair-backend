import { Request, Response } from 'express';
import BaseController from './BaseController';
import { User } from '../models';
import { LoginRequest, AuthResponse } from '../types';
import { AppError } from '../utils';
import JwtService from '../services/JwtService';
import PasswordResetService from '../services/PasswordResetService';
import EmailService from '../services/EmailService';

export default class AuthController extends BaseController {
  /**
   * User login
   */
  login = this.asyncHandler(async (req: Request, res: Response) => {
    const { phone, password }: LoginRequest = req.body;

    // Validate required fields
    this.validateRequired(req.body, ['phone', 'password']);

    // Verify user credentials by phone
    const user = await User.verifyPasswordByPhone(phone!, password);
    if (!user) {
      return this.error(res, 'Số điện thoại hoặc mật khẩu không đúng', 401, 'INVALID_CREDENTIALS');
    }

    // Check if user is active
    if (!user.is_active) {
      return this.error(res, 'Account is deactivated', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Generate tokens
    const tokens = await JwtService.generateTokenPair(user);

    // Response
    const authResponse: AuthResponse = {
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };

    return this.success(res, authResponse, 'Login successful');
  });

  /**
   * User registration
   */
  register = this.asyncHandler(async (req: Request, res: Response) => {
    const { phone, password, full_name, email } = req.body;

    // Validate required fields
    this.validateRequired(req.body, ['phone', 'password', 'full_name', 'email']);

    // Create user with phone as primary identifier
    const user = await User.createUser({
      phone,
      password,
      full_name,
      email,
      role: 'customer', // Default role for registration
    });

    // Generate tokens
    const tokens = await JwtService.generateTokenPair(user);

    // Send welcome email (disabled for now - configure email service later if needed)
    // try {
    //   await EmailService.sendWelcomeEmail(user.email, {
    //     userName: user.full_name,
    //     loginLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`,
    //   });
    // } catch (error) {
    //   console.warn('Failed to send welcome email:', error);
    // }

    // Response
    const authResponse: AuthResponse = {
      user,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };

    return this.success(res, authResponse, 'Registration successful', 201);
  });

  /**
   * Refresh access token
   */
  refreshToken = this.asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return this.error(res, 'Refresh token is required', 400, 'REFRESH_TOKEN_REQUIRED');
    }

    try {
      // Verify refresh token
      const decoded = await JwtService.verifyRefreshToken(refreshToken);

      // Get user
      const user = await User.findById(decoded.userId);
      if (!user || !user.is_active) {
        return this.error(res, 'Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
      }

      // Generate new access token
      const newAccessToken = JwtService.generateAccessToken(user);

      return this.success(
        res,
        {
          token: newAccessToken,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
          },
        },
        'Token refreshed successfully'
      );
    } catch (error) {
      if (error instanceof AppError) {
        return this.error(res, error.message, error.statusCode, 'INVALID_REFRESH_TOKEN');
      }
      return this.error(res, 'Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
  });

  /**
   * Get current user profile
   */
  getProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);

    // Get full profile with additional info
    const profile = await User.getUserProfile(user.id);

    return this.success(res, profile, 'Profile retrieved successfully');
  });

  /**
   * Update user profile
   */
  updateProfile = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    const allowedFields = ['full_name', 'phone', 'email'];
    const updateData = this.filterFields(req.body, allowedFields);

    if (Object.keys(updateData).length === 0) {
      return this.error(res, 'No valid fields to update', 400);
    }

    const updatedUser = await User.updateProfile(user.id, updateData);

    if (!updatedUser) {
      return this.error(res, 'Failed to update profile', 500);
    }

    return this.success(res, updatedUser, 'Profile updated successfully');
  });

  /**
   * Change password
   */
  changePassword = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate required fields
    this.validateRequired(req.body, ['currentPassword', 'newPassword', 'confirmPassword']);

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return this.error(res, 'New passwords do not match', 400, 'PASSWORD_MISMATCH');
    }

    // Verify current password
    const isCurrentPasswordValid = await User.verifyPassword(user.email, currentPassword);
    if (!isCurrentPasswordValid) {
      return this.error(res, 'Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
    }

    // Update password
    const success = await User.updatePassword(user.id, newPassword);
    if (!success) {
      return this.error(res, 'Failed to update password', 500);
    }

    return this.success(res, null, 'Password changed successfully');
  });

  /**
   * Logout (revoke refresh token)
   */
  logout = this.asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        await JwtService.revokeRefreshToken(refreshToken);
      } catch (error) {
        // Log error but don't fail the logout
        console.warn('Failed to revoke refresh token during logout:', error);
      }
    }

    return this.success(res, null, 'Logged out successfully');
  });

  /**
   * Request password reset
   */
  requestPasswordReset = this.asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return this.error(res, 'Email is required', 400, 'EMAIL_REQUIRED');
    }

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return this.success(res, null, 'If the email exists, a reset link has been sent');
    }

    try {
      // Generate reset token
      const resetToken = await PasswordResetService.generateResetToken(user);

      // Create reset link
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

      // Send reset email
      await EmailService.sendPasswordResetEmail(user.email, {
        userName: user.full_name,
        resetLink,
        expiryHours: 1,
      });

      return this.success(res, null, 'If the email exists, a reset link has been sent');
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 429) {
        return this.error(res, error.message, 429, 'TOO_MANY_REQUESTS');
      }

      console.error('Password reset request failed:', error);
      return this.error(res, 'Failed to process password reset request', 500);
    }
  });

  /**
   * Reset password with token
   */
  resetPassword = this.asyncHandler(async (req: Request, res: Response) => {
    const { token, password, confirmPassword } = req.body;

    // Validate required fields
    this.validateRequired(req.body, ['token', 'password', 'confirmPassword']);

    // Check if passwords match
    if (password !== confirmPassword) {
      return this.error(res, 'Passwords do not match', 400, 'PASSWORD_MISMATCH');
    }

    // Validate password strength (basic validation)
    if (password.length < 6) {
      return this.error(res, 'Password must be at least 6 characters long', 400, 'WEAK_PASSWORD');
    }

    try {
      // Reset password
      await PasswordResetService.resetPassword(token, password);

      return this.success(res, null, 'Password reset successfully');
    } catch (error) {
      if (error instanceof AppError) {
        return this.error(res, error.message, error.statusCode, 'PASSWORD_RESET_FAILED');
      }

      console.error('Password reset failed:', error);
      return this.error(res, 'Failed to reset password', 500);
    }
  });

  /**
   * Verify password reset token (check if token is valid)
   */
  verifyResetToken = this.asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token) {
      return this.error(res, 'Token is required', 400, 'TOKEN_REQUIRED');
    }

    try {
      const { user } = await PasswordResetService.verifyResetToken(token);

      return this.success(res, {
        valid: true,
        email: user.email,
      }, 'Token is valid');
    } catch (error) {
      if (error instanceof AppError) {
        return this.error(res, error.message, 400, 'INVALID_TOKEN');
      }

      return this.error(res, 'Invalid or expired token', 400, 'INVALID_TOKEN');
    }
  });

}
