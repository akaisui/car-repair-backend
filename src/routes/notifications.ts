import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import NotificationController from '../controllers/NotificationController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get user notifications with pagination and filters
router.get('/', NotificationController.getUserNotifications);

// Get unread count
router.get('/unread-count', NotificationController.getUnreadCount);

// Get recent notifications (for real-time)
router.get('/recent', NotificationController.getRecentNotifications);

// Mark notification as read
router.put('/:id/read', NotificationController.markAsRead);

// Mark all notifications as read
router.put('/mark-all-read', NotificationController.markAllAsRead);

// Delete notification
router.delete('/:id', NotificationController.deleteNotification);

export default router;