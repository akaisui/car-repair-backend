import { Request, Response } from 'express';
import BaseController from './BaseController';
import pool from '../config/database';

export default class DashboardController extends BaseController {
  /**
   * Get dashboard statistics
   */
  getStats = this.asyncHandler(async (_req: Request, res: Response) => {
    try {
      const connection = await pool.getConnection();
      try {
        // Get appointments statistics
        const appointmentStatsQuery = `
          SELECT
            COUNT(*) as total_appointments,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_appointments,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_appointments,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_appointments,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_appointments,
            SUM(CASE WHEN DATE(appointment_date) = CURDATE() THEN 1 ELSE 0 END) as today_appointments
          FROM appointments
        `;

        const [appointmentRows] = await connection.execute(appointmentStatsQuery);
        const appointmentStats = (appointmentRows as any[])[0];

        // Get revenue statistics from completed repairs
        const revenueQuery = `
          SELECT
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COUNT(*) as completed_repairs
          FROM repairs
          WHERE status = 'completed'
        `;

        const [revenueRows] = await connection.execute(revenueQuery);
        const revenueStats = (revenueRows as any[])[0];

        // Get users statistics
        const userStatsQuery = `
          SELECT
            COUNT(*) as total_users,
            SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as total_customers,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as total_admins,
            SUM(CASE WHEN role = 'staff' THEN 1 ELSE 0 END) as total_staff
          FROM users
        `;

        const [userRows] = await connection.execute(userStatsQuery);
        const userStats = (userRows as any[])[0];

        // Get recent activity (last 10 appointments)
        const recentActivityQuery = `
          SELECT
            a.appointment_code,
            a.status,
            a.appointment_date,
            a.appointment_time,
            a.created_at,
            v.license_plate,
            v.brand,
            v.model,
            s.name as service_name,
            u.full_name as customer_name
          FROM appointments a
          LEFT JOIN vehicles v ON a.vehicle_id = v.id
          LEFT JOIN services s ON a.service_id = s.id
          LEFT JOIN users u ON a.user_id = u.id
          ORDER BY a.created_at DESC
          LIMIT 10
        `;

        const [activityRows] = await connection.execute(recentActivityQuery);
        const recentActivity = activityRows as any[];

        const dashboardStats = {
          appointments: {
            total: parseInt(appointmentStats.total_appointments) || 0,
            pending: parseInt(appointmentStats.pending_appointments) || 0,
            confirmed: parseInt(appointmentStats.confirmed_appointments) || 0,
            completed: parseInt(appointmentStats.completed_appointments) || 0,
            inProgress: parseInt(appointmentStats.in_progress_appointments) || 0,
            today: parseInt(appointmentStats.today_appointments) || 0
          },
          revenue: {
            total: parseFloat(revenueStats.total_revenue) || 0,
            completedRepairs: parseInt(revenueStats.completed_repairs) || 0
          },
          users: {
            total: parseInt(userStats.total_users) || 0,
            customers: parseInt(userStats.total_customers) || 0,
            admins: parseInt(userStats.total_admins) || 0,
            staff: parseInt(userStats.total_staff) || 0
          },
          recentActivity: recentActivity || []
        };

        return this.success(res, dashboardStats, 'Dashboard stats retrieved successfully');
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Dashboard stats error:', error);
      return this.error(res, 'Failed to fetch dashboard statistics', 500);
    }
  });

  /**
   * Get monthly statistics for charts
   */
  getMonthlyStats = this.asyncHandler(async (_req: Request, res: Response) => {
    try {
      const connection = await pool.getConnection();
      try {
        // Get monthly appointments for the last 12 months
        const monthlyAppointmentsQuery = `
          SELECT
            DATE_FORMAT(appointment_date, '%Y-%m') as month,
            COUNT(*) as count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
          FROM appointments
          WHERE appointment_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
          GROUP BY DATE_FORMAT(appointment_date, '%Y-%m')
          ORDER BY month
        `;

        const [appointmentRows] = await connection.execute(monthlyAppointmentsQuery);
        const monthlyAppointments = appointmentRows as any[];

        // Get monthly revenue for the last 12 months
        const monthlyRevenueQuery = `
          SELECT
            DATE_FORMAT(completion_date, '%Y-%m') as month,
            SUM(total_amount) as revenue
          FROM repairs
          WHERE status = 'completed'
          AND completion_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
          GROUP BY DATE_FORMAT(completion_date, '%Y-%m')
          ORDER BY month
        `;

        const [revenueRows] = await connection.execute(monthlyRevenueQuery);
        const monthlyRevenue = revenueRows as any[];

        return this.success(res, {
          monthlyAppointments: monthlyAppointments || [],
          monthlyRevenue: monthlyRevenue || []
        }, 'Monthly stats retrieved successfully');
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Monthly stats error:', error);
      return this.error(res, 'Failed to fetch monthly statistics', 500);
    }
  });
}