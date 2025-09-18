import { Request, Response } from 'express';
import { AppError } from '../utils';
import Notification, { NotificationFilters } from '../models/Notification';
import { User } from '../types';

interface AuthRequest extends Request {
  user?: User;
}

export class NotificationController {

  // Get notifications for current user
  static async getUserNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      const {
        limit = 20,
        offset = 0,
        type,
        is_read
      } = req.query;

      const filters: NotificationFilters = {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      };

      if (type) filters.type = type as string;
      if (is_read !== undefined) filters.is_read = is_read === 'true';

      const [notifications, unreadCount] = await Promise.all([
        Notification.findByUserId(userId, filters),
        Notification.getUnreadCount(userId)
      ]);

      res.json({
        success: true,
        data: {
          notifications,
          unread_count: unreadCount
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting notifications:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy thông báo'
        });
      }
    }
  }

  // Get unread count
  static async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      const unreadCount = await Notification.getUnreadCount(userId);

      res.json({
        success: true,
        data: {
          unread_count: unreadCount
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting unread count:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi đếm thông báo'
        });
      }
    }
  }

  // Mark notification as read
  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      // Verify notification belongs to user
      const notification = await Notification.findById(parseInt(id));
      if (!notification) {
        throw new AppError('Không tìm thấy thông báo', 404);
      }

      if (notification.user_id !== userId) {
        throw new AppError('Không có quyền truy cập', 403);
      }

      const success = await Notification.markAsRead(parseInt(id));

      if (!success) {
        throw new AppError('Không thể cập nhật thông báo', 400);
      }

      res.json({
        success: true,
        message: 'Đã đánh dấu thông báo là đã đọc'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật thông báo'
        });
      }
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      const success = await Notification.markAllAsRead(userId);

      res.json({
        success: true,
        message: success ? 'Đã đánh dấu tất cả thông báo là đã đọc' : 'Không có thông báo nào để cập nhật'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật thông báo'
        });
      }
    }
  }

  // Delete notification
  static async deleteNotification(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      // Verify notification belongs to user
      const notification = await Notification.findById(parseInt(id));
      if (!notification) {
        throw new AppError('Không tìm thấy thông báo', 404);
      }

      if (notification.user_id !== userId) {
        throw new AppError('Không có quyền truy cập', 403);
      }

      const success = await Notification.delete(parseInt(id));

      if (!success) {
        throw new AppError('Không thể xóa thông báo', 400);
      }

      res.json({
        success: true,
        message: 'Đã xóa thông báo'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error deleting notification:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xóa thông báo'
        });
      }
    }
  }

  // Get recent notifications (for real-time updates)
  static async getRecentNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401);
      }

      const { limit = 5 } = req.query;

      const notifications = await Notification.getRecentNotifications(
        userId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: notifications
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting recent notifications:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy thông báo mới'
        });
      }
    }
  }
}

export default NotificationController;