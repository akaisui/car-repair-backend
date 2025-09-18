import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import vehicleRoutes from './vehicles';
import serviceRoutes from './services';
import appointmentRoutes from './appointments';
import repairRoutes from './repairs';
import partRoutes from './parts';
import invoiceRoutes from './invoices';
import reviewRoutes from './reviews';
import notificationRoutes from './notifications';
import dashboardRoutes from './dashboard';
import publicRoutes from './public';

const router = Router();

// API Version
const API_VERSION = '/api/v1';

// Mount routes
router.use(`${API_VERSION}/auth`, authRoutes);
router.use(`${API_VERSION}/users`, userRoutes);
router.use(`${API_VERSION}/vehicles`, vehicleRoutes);
router.use(`${API_VERSION}/services`, serviceRoutes);
router.use(`${API_VERSION}/appointments`, appointmentRoutes);
router.use(`${API_VERSION}/repairs`, repairRoutes);
router.use(`${API_VERSION}/parts`, partRoutes);
router.use(`${API_VERSION}/invoices`, invoiceRoutes);
router.use(`${API_VERSION}/reviews`, reviewRoutes);
router.use(`${API_VERSION}/notifications`, notificationRoutes);
router.use(`${API_VERSION}/dashboard`, dashboardRoutes);

// Public routes (no auth required)
router.use('/api/public', publicRoutes);

// API info endpoint
router.get('/api', (_req, res) => {
  res.json({
    message: 'Car Repair Shop API',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      auth: `${API_VERSION}/auth`,
      users: `${API_VERSION}/users`,
      vehicles: `${API_VERSION}/vehicles`,
      services: `${API_VERSION}/services`,
      appointments: `${API_VERSION}/appointments`,
      repairs: `${API_VERSION}/repairs`,
      parts: `${API_VERSION}/parts`,
      invoices: `${API_VERSION}/invoices`,
      reviews: `${API_VERSION}/reviews`,
      notifications: `${API_VERSION}/notifications`,
      dashboard: `${API_VERSION}/dashboard`,
      public: '/api/public',
    },
  });
});

export default router;
