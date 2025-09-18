import { Request, Response } from 'express';
import BaseController from './BaseController';
import Appointment, { AppointmentFilters } from '../models/Appointment';
import User from '../models/User';
import Vehicle from '../models/Vehicle';
import Service from '../models/Service';
import Repair from '../models/Repair';
import Notification from '../models/Notification';
import EmailService from '../services/EmailService';
import PushNotificationService from '../services/PushNotificationService';
import JwtService from '../services/JwtService';
import { AppError } from '../utils';

/**
 * Appointment Controller
 * Handles appointment booking and management operations
 */
export default class AppointmentController extends BaseController {
  private readonly allowedFields = [
    'user_id',
    'vehicle_id',
    'service_id',
    'appointment_date',
    'appointment_time',
    'status',
    'notes',
  ];

  /**
   * Get appointment by appointment code
   */
  static async getByCode(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;

      if (!code) {
        throw new AppError('Mã lịch hẹn không được cung cấp', 400);
      }

      const appointment = await Appointment.findByCode(code);

      if (!appointment) {
        throw new AppError('Không tìm thấy lịch hẹn', 404);
      }

      res.json({
        success: true,
        data: appointment
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting appointment by code:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy thông tin lịch hẹn'
        });
      }
    }
  }

  /**
   * Get all appointments with pagination and filters
   */
  getAllAppointments = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { user_id, vehicle_id, service_id, status, date_from, date_to, search } = req.query;

    const filters: AppointmentFilters = {};

    if (user_id) filters.user_id = parseInt(user_id as string);
    if (vehicle_id) filters.vehicle_id = parseInt(vehicle_id as string);
    if (service_id) filters.service_id = parseInt(service_id as string);
    if (status) filters.status = status as string;
    if (date_from) filters.date_from = date_from as string;
    if (date_to) filters.date_to = date_to as string;
    if (search) filters.search = search as string;

    const appointments = await Appointment.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count (simplified)
    const total = await Appointment.count(filters);

    return this.paginated(
      res,
      appointments,
      total,
      pagination,
      'Appointments retrieved successfully'
    );
  });

  /**
   * Get appointment by ID
   */
  getAppointmentById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const appointments = await Appointment.findWithDetails({ where: { id } });

    if (appointments.length === 0) {
      return this.notFound(res, 'Appointment');
    }

    return this.success(res, appointments[0], 'Appointment retrieved successfully');
  });

  /**
   * Get appointment by appointment code
   */
  getAppointmentByCode = this.asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    const appointment = await Appointment.findByAppointmentCode(code);

    if (!appointment) {
      return this.notFound(res, 'Appointment');
    }

    return this.success(res, appointment, 'Appointment retrieved successfully');
  });

  /**
   * Book new appointment
   */
  bookAppointment = this.asyncHandler(async (req: Request, res: Response) => {
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate required fields
    this.validateRequired(data, ['user_id', 'appointment_date', 'appointment_time']);

    // Validate user exists
    const user = await User.findById(data.user_id);
    if (!user) {
      throw new AppError('User not found', 400);
    }

    // Validate vehicle if provided
    if (data.vehicle_id) {
      const vehicle = await Vehicle.findById(data.vehicle_id);
      if (!vehicle) {
        throw new AppError('Vehicle not found', 400);
      }

      // Check if vehicle belongs to customer
      if (vehicle.user_id !== data.user_id) {
        throw new AppError('Vehicle does not belong to the specified customer', 400);
      }
    }

    // Validate service if provided
    if (data.service_id) {
      const service = await Service.findById(data.service_id);
      if (!service) {
        throw new AppError('Service not found', 400);
      }

      if (!service.is_active) {
        throw new AppError('Service is not available', 400);
      }
    }

    // Book appointment with conflict checking
    const appointment = await Appointment.bookAppointment(data);

    return this.success(res, appointment, 'Appointment booked successfully', 201);
  });

  /**
   * Book appointment from frontend form (customer provides info, we create customer/vehicle)
   */
  bookAppointmentFromFrontend = this.asyncHandler(async (req: Request, res: Response) => {
    const { service_id, appointment_date, appointment_time, customer_info, vehicle_info, notes } =
      req.body;

    // Validate required fields
    if (!service_id || !appointment_date || !appointment_time || !customer_info || !vehicle_info) {
      throw new AppError('Missing required booking information', 400);
    }

    if (!customer_info.full_name || !customer_info.phone || !vehicle_info.license_plate) {
      throw new AppError('Customer name, phone, and license plate are required', 400);
    }

    // Validate service exists and is active
    const service = await Service.findById(service_id);
    if (!service) {
      throw new AppError('Service not found', 400);
    }
    if (!service.is_active) {
      throw new AppError('Service is not available', 400);
    }

    // Check if user is authenticated and find/create customer
    let customer = null;

    // Try to get authenticated user from token
    if (req.headers.authorization) {
      try {
        const token = JwtService.extractTokenFromHeader(req.headers.authorization);
        if (token) {
          const decoded = JwtService.verifyAccessToken(token);
          console.log('🔐 Decoded token:', decoded);

          if (decoded && decoded.userId) {
            const loggedInUser = await User.findById(decoded.userId);
            if (loggedInUser) {
              console.log('✅ Found authenticated user ID:', loggedInUser.id);

              // Check if user already has customer_code, if not generate one
              if (!loggedInUser.customer_code) {
                console.log('✨ Creating customer code for user ID:', loggedInUser.id);
                const customerCode = await User.generateCustomerCode();
                await User.updateById(loggedInUser.id, { customer_code: customerCode });
              }
              customer = { id: loggedInUser.id };
            }
          }
        }
      } catch (error) {
        console.log('⚠️ Token verification failed:', error);
      }
    }

    // If no authenticated user, we don't create anything - appointments will have user_id = undefined for guests
    if (!customer) {
      console.log('👤 Guest booking - no user account');
      customer = { id: undefined }; // Guest booking
    }

    // Try to find existing vehicle
    let vehicle = await Vehicle.findOne({ license_plate: vehicle_info.license_plate });

    // If vehicle doesn't exist, create new one
    if (!vehicle) {
      const vehicleData: any = {
        license_plate: vehicle_info.license_plate,
        brand: vehicle_info.brand || null,
        model: vehicle_info.model || null,
        year: vehicle_info.year ? parseInt(vehicle_info.year) : null,
        notes: `Created from booking form`,
      };
      if (customer.id !== undefined) {
        vehicleData.user_id = customer.id;
      }
      vehicle = await Vehicle.create(vehicleData);
    } else {
      // Update vehicle's user association if needed
      if (customer.id !== undefined && vehicle.user_id !== customer.id) {
        await Vehicle.updateById(vehicle.id, { user_id: customer.id });
      }
    }

    // Create appointment data
    const appointmentData: any = {
      vehicle_id: vehicle.id,
      service_id: service_id,
      appointment_date: appointment_date,
      appointment_time: appointment_time,
      status: 'pending' as const,
      notes: notes || `Booking from ${customer_info.full_name}`,
    };
    if (customer.id !== undefined) {
      appointmentData.user_id = customer.id;
    }

    // Book appointment with conflict checking
    const appointment = await Appointment.bookAppointment(appointmentData);

    // Return appointment with customer and service info
    const appointmentWithDetails = await Appointment.findWithDetails({
      where: { id: appointment.id },
    });

    // Send emails (async - don't block response)
    const appointmentDetail = appointmentWithDetails[0];
    console.log('📧 Starting email sending process...');
    console.log('📋 Appointment detail:', appointmentDetail);
    console.log('👤 Customer info:', customer_info);
    console.log('🚗 Vehicle info:', vehicle_info);
    console.log('🔧 Service info:', service);

    this.sendBookingEmails(appointmentDetail, customer_info, vehicle_info, service)
      .then(() => console.log('✅ Email sending process completed'))
      .catch((error) => console.error('❌ Error sending booking emails:', error));

    // 🔔 Send realtime notification to all admins about new appointment
    const io = req.app.get('io');
    if (io) {
      // Get all admin users
      const adminUsers = await User.findByRole('admin');
      const staffUsers = await User.findByRole('staff');
      const notifyUsers = [...adminUsers, ...staffUsers];

      // Send notification to each admin/staff user
      for (const user of notifyUsers) {
        // Save notification in database
        await Notification.create({
          user_id: user.id,
          type: 'new_appointment',
          title: '📅 Lịch hẹn mới',
          message: `Khách hàng ${customer_info.full_name} đã đặt lịch hẹn mới cho dịch vụ ${service.name}`,
          data: JSON.stringify({
            appointment_id: appointment.id,
            appointment_code: appointment.appointment_code,
            customer_name: customer_info.full_name,
            customer_phone: customer_info.phone,
            service_name: service.name,
            appointment_date: appointment_date,
            appointment_time: appointment_time,
            vehicle_plate: vehicle_info.license_plate
          })
        });

        // Send realtime notification via Socket.IO
        io.to(`user_${user.id}`).emit('new_notification', {
          type: 'new_appointment',
          title: '📅 Lịch hẹn mới',
          message: `Khách hàng ${customer_info.full_name} đã đặt lịch hẹn mới cho dịch vụ ${service.name}`,
          data: {
            appointment_id: appointment.id,
            appointment_code: appointment.appointment_code,
            customer_name: customer_info.full_name,
            customer_phone: customer_info.phone,
            service_name: service.name,
            appointment_date: appointment_date,
            appointment_time: appointment_time,
            vehicle_plate: vehicle_info.license_plate
          },
          timestamp: new Date()
        });
      }

      // Also send to role-based rooms
      io.to('role_admin').emit('new_notification', {
        type: 'new_appointment',
        title: '📅 Lịch hẹn mới',
        message: `Khách hàng ${customer_info.full_name} đã đặt lịch hẹn mới cho dịch vụ ${service.name}`,
        data: {
          appointment_id: appointment.id,
          appointment_code: appointment.appointment_code,
          customer_name: customer_info.full_name,
          customer_phone: customer_info.phone,
          service_name: service.name,
          appointment_date: appointment_date,
          appointment_time: appointment_time,
          vehicle_plate: vehicle_info.license_plate
        },
        timestamp: new Date()
      });

      console.log(`🔔 Realtime notification sent to ${notifyUsers.length} admin/staff users`);
    }

    // 📱 Send push notification to admin/staff devices
    PushNotificationService.sendNewAppointmentNotification({
      id: appointment.id,
      appointment_code: appointment.appointment_code,
      customer_name: customer_info.full_name,
      customer_phone: customer_info.phone,
      service_name: service.name,
      appointment_date: appointment_date,
      appointment_time: appointment_time,
      vehicle_plate: vehicle_info.license_plate
    }).then(() => {
      console.log('📱 Push notification sent to admin/staff devices');
    }).catch((error) => {
      console.error('❌ Failed to send push notification:', error);
    });

    return this.success(
      res,
      {
        appointment: appointmentDetail,
        customer_info: customer_info,
        vehicle_info: vehicle_info,
        service: service,
      },
      'Appointment booked successfully',
      201
    );
  });

  /**
   * Get appointments for logged in user
   */
  getUserAppointments = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);
    const pagination = this.getPagination(req);

    console.log('🔍 Getting appointments for user:', user.email, 'ID:', user.id);

    // Get appointments for this user directly
    const appointments = await Appointment.findWithDetails({
      where: { user_id: user.id },
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: 'a.appointment_date DESC, a.appointment_time DESC',
    });

    console.log('📋 Found appointments:', appointments.length);
    console.log('📊 Appointments data:', appointments);

    // Get total count
    const total = await Appointment.count({ user_id: user.id });

    return this.paginated(
      res,
      appointments,
      total,
      pagination,
      'User appointments retrieved successfully'
    );
  });

  /**
   * Update appointment
   */
  updateAppointment = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate user exists if provided
    if (data.user_id) {
      const user = await User.findById(data.user_id);
      if (!user) {
        throw new AppError('User not found', 400);
      }
    }

    // Validate vehicle if provided
    if (data.vehicle_id) {
      const vehicle = await Vehicle.findById(data.vehicle_id);
      if (!vehicle) {
        throw new AppError('Vehicle not found', 400);
      }
    }

    // Validate service if provided
    if (data.service_id) {
      const service = await Service.findById(data.service_id);
      if (!service) {
        throw new AppError('Service not found', 400);
      }
    }

    const appointment = await Appointment.updateById(id, data);

    if (!appointment) {
      return this.notFound(res, 'Appointment');
    }

    return this.success(res, appointment, 'Appointment updated successfully');
  });

  /**
   * Update appointment status
   */
  updateAppointmentStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const { status, notes } = req.body;

    if (!status) {
      throw new AppError('Status is required', 400);
    }

    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    // Get appointment details before updating (need for repair creation)
    const appointmentDetails = await Appointment.findWithDetails({ where: { id } });

    if (appointmentDetails.length === 0) {
      return this.notFound(res, 'Appointment');
    }

    const appointmentDetail = appointmentDetails[0];

    const appointment = await Appointment.updateStatus(id, status, notes);

    if (!appointment) {
      return this.notFound(res, 'Appointment');
    }

    // 🔧 AUTO-CREATE REPAIR WHEN APPOINTMENT CONFIRMED
    if (status === 'confirmed') {
      try {
        // Check if repair already exists for this appointment
        const repairExists = await Repair.existsByAppointment(id);

        if (!repairExists) {
          // Validate required fields
          if (!appointmentDetail.user_id || !appointmentDetail.vehicle_id) {
            console.error('❌ Cannot create repair: missing user_id or vehicle_id');
            throw new Error('Missing required fields for repair creation');
          }

          // Create new repair record
          const repairCode = await Repair.generateRepairCode();

          const repairData = {
            repair_code: repairCode,
            appointment_id: id,
            user_id: appointmentDetail.user_id,
            vehicle_id: appointmentDetail.vehicle_id,
            status: 'pending' as const,
            notes: `Auto-created from confirmed appointment #${appointmentDetail.appointment_code}`,
          };

          const repairId = await Repair.create(repairData);

          console.log(`✅ Auto-created repair #${repairCode} (ID: ${repairId}) for appointment #${appointmentDetail.appointment_code}`);

          // 🔔 Create notification for customer
          if (appointmentDetail.appointment_code) {
            await Notification.createAppointmentConfirmed(
              appointmentDetail.user_id,
              appointmentDetail.appointment_code,
              repairCode
            );
          }

          console.log(`✅ Notification sent to user #${appointmentDetail.user_id} about appointment confirmation and repair creation`);

          // Emit Socket.IO event for realtime notification
          const io = req.app.get('io');
          if (io) {
            io.to(`user_${appointmentDetail.user_id}`).emit('new_notification', {
              type: 'appointment_confirmed',
              title: 'Lịch hẹn đã được xác nhận',
              message: `Lịch hẹn ${appointmentDetail.appointment_code} đã được xác nhận và phiếu sửa chữa ${repairCode} đã được tạo tự động.`,
              data: {
                appointment_id: id,
                repair_code: repairCode
              }
            });
            console.log(`🔌 Socket.IO notification sent to user_${appointmentDetail.user_id}`);
          }

          // 📱 Send push notification to customer
          PushNotificationService.sendAppointmentConfirmationNotification(
            appointmentDetail.user_id,
            appointmentDetail,
            repairCode
          ).then(() => {
            console.log('📱 Push notification sent to customer about appointment confirmation');
          }).catch((error) => {
            console.error('❌ Failed to send push notification to customer:', error);
          });

        } else {
          console.log(`ℹ️ Repair already exists for appointment #${appointmentDetail.appointment_code}`);
        }
      } catch (error) {
        console.error('❌ Error auto-creating repair:', error);
        // Don't fail the appointment update if repair creation fails
      }
    }

    return this.success(res, appointment, `Appointment status updated to ${status}`);
  });

  /**
   * Cancel appointment
   */
  cancelAppointment = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const { reason } = req.body;

    const appointment = await Appointment.cancelAppointment(id, reason);

    if (!appointment) {
      return this.notFound(res, 'Appointment');
    }

    return this.success(res, appointment, 'Appointment cancelled successfully');
  });

  /**
   * Reschedule appointment
   */
  rescheduleAppointment = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const { new_date, new_time, reason } = req.body;

    if (!new_date || !new_time) {
      throw new AppError('New date and time are required', 400);
    }

    const appointment = await Appointment.rescheduleAppointment(id, new_date, new_time, reason);

    if (!appointment) {
      return this.notFound(res, 'Appointment');
    }

    return this.success(res, appointment, 'Appointment rescheduled successfully');
  });

  /**
   * Search appointments
   */
  searchAppointments = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { user_id, vehicle_id, service_id, status, date_from, date_to, search } = req.query;

    const filters: AppointmentFilters = {};

    if (user_id) filters.user_id = parseInt(user_id as string);
    if (vehicle_id) filters.vehicle_id = parseInt(vehicle_id as string);
    if (service_id) filters.service_id = parseInt(service_id as string);
    if (status) filters.status = status as string;
    if (date_from) filters.date_from = date_from as string;
    if (date_to) filters.date_to = date_to as string;
    if (search) filters.search = search as string;

    const appointments = await Appointment.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count (simplified)
    const total = appointments.length;

    return this.paginated(
      res,
      appointments,
      total,
      pagination,
      'Appointments searched successfully'
    );
  });

  /**
   * Get calendar view
   */
  getCalendarView = this.asyncHandler(async (req: Request, res: Response) => {
    const { start_date, end_date, view } = req.query;

    if (!start_date || !end_date) {
      throw new AppError('Start date and end date are required', 400);
    }

    const calendarView = await Appointment.getCalendarView(
      start_date as string,
      end_date as string,
      (view as 'day' | 'week' | 'month') || 'month'
    );

    return this.success(res, calendarView, 'Calendar view retrieved successfully');
  });

  /**
   * Check time slot availability
   */
  checkTimeSlotAvailability = this.asyncHandler(async (req: Request, res: Response) => {
    const { date, time } = req.query;

    if (!date) {
      throw new AppError('Date is required', 400);
    }

    const availableSlots = await Appointment.checkTimeSlotAvailability(
      date as string,
      time as string | undefined
    );

    return this.success(res, availableSlots, 'Time slot availability checked successfully');
  });

  /**
   * Get appointments by customer
   */
  getAppointmentsByCustomer = this.asyncHandler(async (req: Request, res: Response) => {
    const customerId = this.parseId(req, 'customerId');
    const pagination = this.getPagination(req);

    // Verify user exists
    const user = await User.findById(customerId);
    if (!user) {
      return this.notFound(res, 'User');
    }

    const appointments = await Appointment.search(
      { user_id: customerId },
      {
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        orderBy: `appointment_date DESC, appointment_time DESC`,
      }
    );

    const total = await Appointment.count({ user_id: customerId });

    return this.paginated(
      res,
      appointments,
      total,
      pagination,
      'Customer appointments retrieved successfully'
    );
  });

  /**
   * Get appointments by vehicle
   */
  getAppointmentsByVehicle = this.asyncHandler(async (req: Request, res: Response) => {
    const vehicleId = this.parseId(req, 'vehicleId');
    const pagination = this.getPagination(req);

    // Verify vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return this.notFound(res, 'Vehicle');
    }

    const appointments = await Appointment.search(
      { vehicle_id: vehicleId },
      {
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        orderBy: `appointment_date DESC, appointment_time DESC`,
      }
    );

    const total = await Appointment.count({ vehicle_id: vehicleId });

    return this.paginated(
      res,
      appointments,
      total,
      pagination,
      'Vehicle appointments retrieved successfully'
    );
  });

  /**
   * Get today's appointments
   */
  getTodayAppointments = this.asyncHandler(async (_req: Request, res: Response) => {
    const today = new Date().toISOString().split('T')[0];

    const appointments = await Appointment.search(
      { date_from: today, date_to: today },
      { orderBy: 'appointment_time ASC' }
    );

    return this.success(res, appointments, "Today's appointments retrieved successfully");
  });

  /**
   * Get upcoming appointments
   */
  getUpcomingAppointments = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const today = new Date().toISOString().split('T')[0];

    const appointments = await Appointment.search(
      {
        date_from: today,
        status: 'confirmed',
      },
      {
        limit,
        orderBy: 'appointment_date ASC, appointment_time ASC',
      }
    );

    return this.success(res, appointments, 'Upcoming appointments retrieved successfully');
  });

  /**
   * Get appointments requiring reminders
   */
  getAppointmentsForReminder = this.asyncHandler(async (req: Request, res: Response) => {
    const hoursAhead = req.query.hours_ahead ? parseInt(req.query.hours_ahead as string) : 24;

    const appointments = await Appointment.getAppointmentsForReminder(hoursAhead);

    return this.success(res, appointments, 'Appointments for reminder retrieved successfully');
  });

  /**
   * Send reminder for appointment
   */
  sendAppointmentReminder = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const { method } = req.body; // 'sms', 'email', or 'both'

    // Get appointment details
    const appointments = await Appointment.findWithDetails({ where: { id } });

    if (appointments.length === 0) {
      return this.notFound(res, 'Appointment');
    }

    const appointment = appointments[0];

    // TODO: Integrate with SMS/Email service
    // For now, just mark as sent
    const success = await Appointment.markReminderSent(id);

    if (!success) {
      throw new AppError('Failed to send reminder', 500);
    }

    return this.success(
      res,
      {
        appointment,
        reminder_method: method || 'system',
        sent_at: new Date(),
      },
      'Appointment reminder sent successfully'
    );
  });

  /**
   * Get appointment statistics
   */
  getAppointmentStatistics = this.asyncHandler(async (req: Request, res: Response) => {
    const { date_from, date_to } = req.query;

    const statistics = await Appointment.getStatistics(
      date_from as string | undefined,
      date_to as string | undefined
    );

    return this.success(res, statistics, 'Appointment statistics retrieved successfully');
  });

  /**
   * Get available time slots for a specific date
   */
  getAvailableTimeSlots = this.asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.params;
    const { service_id } = req.query;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }

    // Check if date is in the past
    const requestedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (requestedDate < today) {
      return this.success(res, [], 'No slots available for past dates');
    }

    const availableSlots = await Appointment.checkTimeSlotAvailability(date);

    // Filter by service duration if service_id provided
    let filteredSlots = availableSlots;
    if (service_id) {
      const service = await Service.findById(parseInt(service_id as string));
      if (service && service.duration_minutes) {
        // TODO: Implement duration-based filtering
        // For now, return all available slots
      }
    }

    return this.success(
      res,
      {
        date,
        available_slots: filteredSlots.filter((slot) => slot.available),
        total_slots: filteredSlots.length,
        available_count: filteredSlots.filter((slot) => slot.available).length,
      },
      'Available time slots retrieved successfully'
    );
  });

  /**
   * Bulk update appointment status
   */
  bulkUpdateStatus = this.asyncHandler(async (req: Request, res: Response) => {
    const { appointment_ids, status, notes } = req.body;

    if (!Array.isArray(appointment_ids) || appointment_ids.length === 0) {
      throw new AppError('appointment_ids must be a non-empty array', 400);
    }

    if (!status) {
      throw new AppError('status is required', 400);
    }

    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid status', 400);
    }

    const results = [];
    for (const appointmentId of appointment_ids) {
      try {
        const appointment = await Appointment.updateStatus(appointmentId, status, notes);
        if (appointment) {
          results.push(appointment);
        }
      } catch (error) {
        // Continue with other appointments if one fails
        console.error(`Failed to update appointment ${appointmentId}:`, error);
      }
    }

    return this.success(
      res,
      {
        updated_appointments: results,
        updated_count: results.length,
        requested_count: appointment_ids.length,
      },
      'Appointments status updated successfully'
    );
  });

  /**
   * Send booking confirmation emails (async)
   */
  private async sendBookingEmails(
    appointment: any,
    customer_info: any,
    vehicle_info: any,
    service: any
  ): Promise<void> {
    try {
      console.log('🔄 Starting sendBookingEmails function...');
      console.log('📧 Customer email from info:', customer_info.email);

      // Shop info from environment or defaults
      const shopInfo = {
        name: process.env.SHOP_NAME || 'SỬA XE HỒNG HẬU',
        address: process.env.SHOP_ADDRESS || '541 Trần Hưng Đạo, Phường Phú Lợi, TP Cần Thơ',
        phone: process.env.SHOP_PHONE || '033-803-7868',
        email: process.env.SHOP_EMAIL || 'suaxehonghau@gmail.com',
      };

      console.log('🏪 Shop info:', shopInfo);

      // Customer email data
      const customerEmailData = {
        customerName: customer_info.full_name,
        customerEmail: customer_info.email,
        customerPhone: customer_info.phone,
        appointmentCode: appointment.appointment_code,
        serviceName: service.name,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.appointment_time,
        vehicleInfo: `${vehicle_info.brand || ''} ${vehicle_info.model || ''}`.trim() || 'Xe máy',
        licensePlate: vehicle_info.license_plate,
        notes: appointment.notes,
        shopInfo,
      };

      // Admin notification data
      const adminEmailData = {
        customerName: customer_info.full_name,
        customerPhone: customer_info.phone,
        customerEmail: customer_info.email,
        appointmentCode: appointment.appointment_code,
        serviceName: service.name,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.appointment_time,
        vehicleInfo: `${vehicle_info.brand || ''} ${vehicle_info.model || ''}`.trim() || 'Xe máy',
        licensePlate: vehicle_info.license_plate,
        notes: appointment.notes,
      };

      // Send emails concurrently
      const promises = [];

      // Send customer confirmation email (only if email provided)
      if (customer_info.email) {
        promises.push(
          EmailService.sendBookingConfirmation(customerEmailData)
            .then(() => console.log(`✅ Customer email sent to: ${customer_info.email}`))
            .catch((error) => console.error('❌ Failed to send customer email:', error))
        );
      }

      // Send admin notification email
      promises.push(
        EmailService.sendAdminNotification(adminEmailData)
          .then(() =>
            console.log(`✅ Admin notification sent for booking: ${appointment.appointment_code}`)
          )
          .catch((error) => console.error('❌ Failed to send admin notification:', error))
      );

      // Wait for all emails to complete (but don't throw if they fail)
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error in sendBookingEmails:', error);
      // Don't throw - we don't want email failures to affect the booking response
    }
  }
}
