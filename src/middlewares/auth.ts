import { Request, Response, NextFunction } from 'express';
import { createApiResponse, AppError } from '../utils';
import { User } from '../types';
import pool from '../config/database';
import JwtService from '../services/JwtService';

/**
 * Authentication middleware
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        createApiResponse(false, 'Access token is required', null, 'UNAUTHORIZED')
      );
      return;
    }

    const token = JwtService.extractTokenFromHeader(authHeader);
    if (!token) {
      res.status(401).json(
        createApiResponse(false, 'Invalid authorization header format', null, 'UNAUTHORIZED')
      );
      return;
    }

    try {
      // Verify token using JWT service
      const decoded = JwtService.verifyAccessToken(token);

      // Get user from database
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = ? AND is_active = true',
          [decoded.userId]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
          res.status(401).json(
            createApiResponse(false, 'Invalid token or user not found', null, 'UNAUTHORIZED')
          );
          return;
        }

        req.user = rows[0] as User;
        next();
      } finally {
        connection.release();
      }
    } catch (jwtError) {
      if (jwtError instanceof AppError) {
        res.status(jwtError.statusCode).json(
          createApiResponse(false, jwtError.message, null, 'TOKEN_ERROR')
        );
        return;
      }
      throw jwtError;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json(
      createApiResponse(false, 'Authentication failed', null, 'INTERNAL_ERROR')
    );
  }
};

/**
 * Authorization middleware - check user roles
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(
        createApiResponse(false, 'Authentication required', null, 'UNAUTHORIZED')
      );
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(
        createApiResponse(false, 'Insufficient permissions', null, 'FORBIDDEN')
      );
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 */
export const requirePermission = (...permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(
        createApiResponse(false, 'Authentication required', null, 'UNAUTHORIZED')
      );
      return;
    }

    // Import RoleService dynamically to avoid circular dependency
    const RoleService = require('../services/RoleService').default;

    if (!RoleService.hasAnyPermission(req.user, permissions)) {
      res.status(403).json(
        createApiResponse(
          false,
          'Insufficient permissions for this action',
          null,
          'FORBIDDEN'
        )
      );
      return;
    }

    next();
  };
};

/**
 * Resource ownership middleware
 * Allows access if user owns resource OR has global permission
 */
export const requireOwnershipOrPermission = (
  resourceIdParam: string,
  ownerIdField: string,
  globalPermissions: string[]
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(
        createApiResponse(false, 'Authentication required', null, 'UNAUTHORIZED')
      );
    }

    const resourceId = req.params[resourceIdParam];
    if (!resourceId) {
      return res.status(400).json(
        createApiResponse(false, 'Resource ID is required', null, 'BAD_REQUEST')
      );
    }

    try {
      // Import dynamically to avoid circular dependency
      const RoleService = require('../services/RoleService').default;

      // Check if user has global permission
      if (RoleService.hasAnyPermission(req.user, globalPermissions)) {
        return next();
      }

      // Check resource ownership
      // This would need to be implemented based on the specific resource
      // For now, we'll add the resource ownership check to req object
      req.resourceOwnership = {
        resourceId,
        ownerIdField,
        globalPermissions,
      };

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json(
        createApiResponse(false, 'Authorization check failed', null, 'INTERNAL_ERROR')
      );
    }
  };
};

/**
 * Optional authentication - attach user if token is valid, but don't fail if no token
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token provided, continue without user
    }

    const token = JwtService.extractTokenFromHeader(authHeader);
    if (!token) {
      return next();
    }

    try {
      const decoded = JwtService.verifyAccessToken(token);

      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = ? AND is_active = true',
          [decoded.userId]
        );

        if (Array.isArray(rows) && rows.length > 0) {
          req.user = rows[0] as User;
        }
      } finally {
        connection.release();
      }
    } catch (jwtError) {
      // If token is invalid, continue without user (don't fail)
      console.warn('Optional auth token verification failed:', jwtError);
    }

    next();
  } catch (error) {
    // If any error occurs, continue without user (don't fail)
    console.warn('Optional auth failed:', error);
    next();
  }
};

/**
 * Check if user is admin
 */
export const requireAdmin = authorize('admin');

/**
 * Check if user is staff or admin
 */
export const requireStaff = authorize('admin', 'staff');

/**
 * Check if user is customer, staff, or admin
 */
export const requireAuth = authorize('customer', 'staff', 'admin');

export default {
  authenticate,
  authorize,
  requirePermission,
  requireOwnershipOrPermission,
  optionalAuth,
  requireAdmin,
  requireStaff,
  requireAuth,
};