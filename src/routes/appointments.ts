import { Router } from 'express';
import AppointmentController from '../controllers/AppointmentController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
const appointmentController = new AppointmentController();

// === PUBLIC ROUTES ===

// Public appointment booking (for customers)
router.post('/book', appointmentController.bookAppointmentFromFrontend);
router.get('/code/:code', appointmentController.getAppointmentByCode);
router.get('/available-slots/:date', appointmentController.getAvailableTimeSlots);
router.get('/check-availability', appointmentController.checkTimeSlotAvailability);

// === AUTHENTICATED ROUTES ===

// General authenticated routes
router.get('/by-code/:code', authenticate, AppointmentController.getByCode);
router.get('/search', authenticate, appointmentController.searchAppointments);
router.get('/today', authenticate, appointmentController.getTodayAppointments);
router.get('/upcoming', authenticate, appointmentController.getUpcomingAppointments);
router.get('/customer/:customerId', authenticate, appointmentController.getAppointmentsByCustomer);
router.get('/vehicle/:vehicleId', authenticate, appointmentController.getAppointmentsByVehicle);

// Customer routes (customers can only access their own appointments)
router.get('/my-appointments', authenticate, authorize('customer'), appointmentController.getAppointmentsByCustomer);
router.get('/user-appointments', authenticate, appointmentController.getUserAppointments);

// === STAFF/ADMIN ROUTES ===

// Staff and admin routes
router.get('/', authenticate, authorize('admin', 'staff'), appointmentController.getAllAppointments);
router.get('/calendar', authenticate, authorize('admin', 'staff'), appointmentController.getCalendarView);
router.get('/statistics', authenticate, authorize('admin'), appointmentController.getAppointmentStatistics);
router.get('/reminders', authenticate, authorize('admin', 'staff'), appointmentController.getAppointmentsForReminder);
router.get('/:id', authenticate, authorize('admin', 'staff'), appointmentController.getAppointmentById);

// Create appointment (staff/admin can book for customers)
router.post('/', authenticate, authorize('admin', 'staff'), appointmentController.bookAppointment);

// Update operations
router.put('/:id', authenticate, authorize('admin', 'staff'), appointmentController.updateAppointment);
router.put('/:id/status', authenticate, authorize('admin', 'staff'), appointmentController.updateAppointmentStatus);
router.put('/:id/cancel', authenticate, authorize('admin', 'staff', 'customer'), appointmentController.cancelAppointment);
router.put('/:id/reschedule', authenticate, authorize('admin', 'staff', 'customer'), appointmentController.rescheduleAppointment);

// Reminder operations
router.post('/:id/send-reminder', authenticate, authorize('admin', 'staff'), appointmentController.sendAppointmentReminder);

// Bulk operations (admin only)
router.put('/bulk/status', authenticate, authorize('admin'), appointmentController.bulkUpdateStatus);

export default router;