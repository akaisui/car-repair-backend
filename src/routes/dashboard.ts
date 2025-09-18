import { Router } from 'express';
import DashboardController from '../controllers/DashboardController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();
const dashboardController = new DashboardController();

// All dashboard routes require admin or staff role
router.use(authenticate);
router.use(requireStaff);

// Get dashboard statistics
router.get('/stats', dashboardController.getStats);

// Get monthly statistics for charts
router.get('/monthly-stats', dashboardController.getMonthlyStats);

export default router;