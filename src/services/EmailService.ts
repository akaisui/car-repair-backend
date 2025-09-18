import nodemailer, { Transporter } from 'nodemailer';
import { AppError } from '../utils';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

interface PasswordResetEmailData {
  userName: string;
  resetLink: string;
  expiryHours: number;
}

interface WelcomeEmailData {
  userName: string;
  loginLink: string;
}

interface BookingConfirmationData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  appointmentCode: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  vehicleInfo: string;
  licensePlate: string;
  notes?: string;
  shopInfo: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

interface AdminNotificationData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  appointmentCode: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  vehicleInfo: string;
  licensePlate: string;
  notes?: string;
}

export default class EmailService {
  private static transporter: Transporter | null = null;

  /**
   * Initialize email transporter
   */
  private static async getTransporter(): Promise<Transporter> {
    if (!this.transporter) {
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
        throw new AppError('Email configuration not found', 500);
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_PORT === '465',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      // Verify connection configuration
      try {
        await this.transporter.verify();
        console.log('✅ Email service initialized successfully');
      } catch (error) {
        console.error('❌ Email service verification failed:', error);
        throw new AppError('Email service configuration error', 500);
      }
    }

    if (!this.transporter) {
      throw new AppError('Email transporter not initialized', 500);
    }

    return this.transporter;
  }

  /**
   * Send email
   */
  static async sendEmail(options: EmailOptions): Promise<void> {
    try {
      console.log('📤 Preparing to send email...');
      console.log('📧 To:', options.to);
      console.log('📝 Subject:', options.subject);

      const transporter = await this.getTransporter();

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Car Repair Shop',
          address: process.env.EMAIL_FROM || process.env.EMAIL_USER!,
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      console.log('📮 Sending email with transporter...');
      const result = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${options.to} - MessageID:`, result.messageId);
    } catch (error) {
      console.error('❌ Failed to send email to', options.to, '- Error:', error);
      throw new AppError('Failed to send email', 500);
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(
    email: string,
    data: PasswordResetEmailData
  ): Promise<void> {
    const subject = 'Reset Your Password - Car Repair Shop';
    const html = this.generatePasswordResetHtml(data);
    const text = this.generatePasswordResetText(data);

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(email: string, data: WelcomeEmailData): Promise<void> {
    const subject = 'Welcome to Car Repair Shop!';
    const html = this.generateWelcomeHtml(data);
    const text = this.generateWelcomeText(data);

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send booking confirmation email to customer (Vietnamese)
   */
  static async sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
    console.log('🔄 Attempting to send booking confirmation email...');
    console.log('📧 Customer email:', data.customerEmail);
    console.log('📝 Appointment code:', data.appointmentCode);

    const subject = `Xác nhận đặt lịch hẹn - Mã: ${data.appointmentCode}`;
    const html = this.generateBookingConfirmationHTML(data);

    try {
      await this.sendEmail({
        to: data.customerEmail,
        subject,
        html,
      });
      console.log('✅ Booking confirmation email sent successfully!');
    } catch (error) {
      console.error('❌ Failed to send booking confirmation email:', error);
      throw error;
    }
  }

  /**
   * Send new appointment notification to admin/staff
   */
  static async sendAdminNotification(data: AdminNotificationData): Promise<void> {
    console.log('🔄 Attempting to send admin notification email...');
    console.log('👨‍💼 Admin email:', process.env.ADMIN_EMAIL || 'admin@carrepair.com');
    console.log('📝 Appointment code:', data.appointmentCode);

    const subject = `🔔 Lịch hẹn mới - ${data.appointmentCode}`;
    const html = this.generateAdminNotificationHTML(data);

    try {
      await this.sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@carrepair.com',
        subject,
        html,
      });
      console.log('✅ Admin notification email sent successfully!');
    } catch (error) {
      console.error('❌ Failed to send admin notification email:', error);
      throw error;
    }
  }

  /**
   * Send reminder email 24h before appointment
   */
  static async sendAppointmentReminder(data: BookingConfirmationData): Promise<void> {
    const subject = `🔔 Nhắc lịch hẹn ngày mai - ${data.appointmentCode}`;
    const html = this.generateReminderHTML(data);

    await this.sendEmail({
      to: data.customerEmail,
      subject,
      html,
    });
  }

  /**
   * Send appointment confirmation email (Legacy - for backward compatibility)
   */
  static async sendAppointmentConfirmation(
    email: string,
    appointmentData: {
      customerName: string;
      appointmentCode: string;
      serviceName: string;
      appointmentDate: string;
      appointmentTime: string;
    }
  ): Promise<void> {
    const subject = `Appointment Confirmation - ${appointmentData.appointmentCode}`;
    const html = this.generateAppointmentConfirmationHtml(appointmentData);
    const text = this.generateAppointmentConfirmationText(appointmentData);

    await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  /**
   * Generate password reset HTML email
   */
  private static generatePasswordResetHtml(data: PasswordResetEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background-color: #fef3cd; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>We received a request to reset your password for your Car Repair Shop account. If you made this request, click the button below to reset your password:</p>

            <div style="text-align: center;">
              <a href="${data.resetLink}" class="button">Reset Password</a>
            </div>

            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${data.resetLink}</p>

            <div class="warning">
              <strong>Important:</strong> This link will expire in ${data.expiryHours} hour(s). If you didn't request this password reset, please ignore this email or contact our support team.
            </div>

            <p>For security reasons, this link can only be used once. After resetting your password, you'll need to log in with your new password.</p>

            <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Car Repair Shop. All rights reserved.</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate password reset text email
   */
  private static generatePasswordResetText(data: PasswordResetEmailData): string {
    return `
      Password Reset Request

      Hello ${data.userName},

      We received a request to reset your password for your Car Repair Shop account.

      If you made this request, click the following link to reset your password:
      ${data.resetLink}

      This link will expire in ${data.expiryHours} hour(s).

      If you didn't request this password reset, please ignore this email.

      For security reasons, this link can only be used once.

      Car Repair Shop Team
    `;
  }

  /**
   * Generate welcome HTML email
   */
  private static generateWelcomeHtml(data: WelcomeEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Car Repair Shop!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Car Repair Shop!</h1>
          </div>
          <div class="content">
            <p>Hello ${data.userName},</p>
            <p>Welcome to Car Repair Shop! We're excited to have you as part of our community.</p>

            <p>Your account has been successfully created. You can now:</p>
            <ul>
              <li>Book appointments online</li>
              <li>Track your repair progress</li>
              <li>View your service history</li>
              <li>Earn loyalty points</li>
              <li>Receive exclusive offers</li>
            </ul>

            <div style="text-align: center;">
              <a href="${data.loginLink}" class="button">Login to Your Account</a>
            </div>

            <p>If you have any questions or need assistance, don't hesitate to contact our support team.</p>

            <p>Thank you for choosing Car Repair Shop for your automotive needs!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Car Repair Shop. All rights reserved.</p>
            <p>Contact us: support@carrepairshop.com | (555) 123-4567</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate welcome text email
   */
  private static generateWelcomeText(data: WelcomeEmailData): string {
    return `
      Welcome to Car Repair Shop!

      Hello ${data.userName},

      Welcome to Car Repair Shop! We're excited to have you as part of our community.

      Your account has been successfully created. You can now:
      - Book appointments online
      - Track your repair progress
      - View your service history
      - Earn loyalty points
      - Receive exclusive offers

      Login to your account: ${data.loginLink}

      If you have any questions or need assistance, don't hesitate to contact our support team.

      Thank you for choosing Car Repair Shop for your automotive needs!

      Car Repair Shop Team
      Contact: support@carrepairshop.com | (555) 123-4567
    `;
  }

  /**
   * Generate appointment confirmation HTML
   */
  private static generateAppointmentConfirmationHtml(data: {
    customerName: string;
    appointmentCode: string;
    serviceName: string;
    appointmentDate: string;
    appointmentTime: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Appointment Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
          .appointment-details { background-color: white; border: 2px solid #d1fae5; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .label { font-weight: bold; color: #065f46; }
          .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hello ${data.customerName},</p>
            <p>Your appointment has been successfully confirmed. Here are the details:</p>

            <div class="appointment-details">
              <div class="detail-row">
                <span class="label">Appointment Code:</span>
                <span>${data.appointmentCode}</span>
              </div>
              <div class="detail-row">
                <span class="label">Service:</span>
                <span>${data.serviceName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Date:</span>
                <span>${data.appointmentDate}</span>
              </div>
              <div class="detail-row">
                <span class="label">Time:</span>
                <span>${data.appointmentTime}</span>
              </div>
            </div>

            <p><strong>Please arrive 10 minutes early</strong> and bring:</p>
            <ul>
              <li>Vehicle registration documents</li>
              <li>Previous service records (if available)</li>
              <li>Valid ID</li>
            </ul>

            <p>If you need to reschedule or cancel your appointment, please contact us at least 24 hours in advance.</p>

            <p>We look forward to serving you!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Car Repair Shop. All rights reserved.</p>
            <p>Contact us: (555) 123-4567 | support@carrepairshop.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate appointment confirmation text
   */
  private static generateAppointmentConfirmationText(data: {
    customerName: string;
    appointmentCode: string;
    serviceName: string;
    appointmentDate: string;
    appointmentTime: string;
  }): string {
    return `
      Appointment Confirmed!

      Hello ${data.customerName},

      Your appointment has been successfully confirmed.

      Appointment Details:
      - Code: ${data.appointmentCode}
      - Service: ${data.serviceName}
      - Date: ${data.appointmentDate}
      - Time: ${data.appointmentTime}

      Please arrive 10 minutes early and bring:
      - Vehicle registration documents
      - Previous service records (if available)
      - Valid ID

      If you need to reschedule or cancel, please contact us at least 24 hours in advance.

      We look forward to serving you!

      Car Repair Shop Team
      Phone: (555) 123-4567
      Email: support@carrepairshop.com
    `;
  }

  /**
   * Generate booking confirmation HTML email (Vietnamese)
   */
  private static generateBookingConfirmationHTML(data: BookingConfirmationData): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xác Nhận Đặt Lịch Hẹn - ${data.appointmentCode}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }

        .email-container {
            max-width: 650px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 25px;
            overflow: hidden;
            box-shadow: 0 30px 70px rgba(0, 0, 0, 0.12);
            position: relative;
        }

        .email-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c, #4facfe, #00f2fe);
            background-size: 400% 400%;
            animation: rainbow 4s ease infinite;
        }

        @keyframes rainbow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .success-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 60px 40px;
            text-align: center;
            color: white;
            position: relative;
            overflow: hidden;
        }

        .success-header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="25" cy="25" r="3" fill="rgba(255,255,255,0.1)"/><circle cx="75" cy="75" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="45" cy="65" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="85" cy="35" r="2.5" fill="rgba(255,255,255,0.1)"/></svg>');
            animation: sparkle 25s infinite linear;
        }

        @keyframes sparkle {
            0% { transform: translateX(-50%) translateY(-50%) rotate(0deg); }
            100% { transform: translateX(-50%) translateY(-50%) rotate(360deg); }
        }

        .success-icon {
            font-size: 60px;
            margin-bottom: 25px;
            display: block;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            animation: bounce 2s ease infinite;
        }

        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
        }

        .success-title {
            font-size: 36px;
            font-weight: 800;
            margin-bottom: 15px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .success-subtitle {
            font-size: 18px;
            font-weight: 600;
            opacity: 0.9;
            margin-bottom: 25px;
        }

        .appointment-badge {
            background: rgba(255, 255, 255, 0.2);
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 700;
            display: inline-block;
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255, 255, 255, 0.3);
            letter-spacing: 2px;
        }

        .main-content {
            padding: 50px 40px;
            background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        }

        .appointment-details {
            background: linear-gradient(135deg, #ffffff 0%, #f1f3f4 100%);
            border-radius: 20px;
            padding: 40px;
            margin: 30px 0;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
            border: 1px solid #e9ecef;
            position: relative;
        }

        .appointment-details::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 8px;
            height: 100%;
            background: linear-gradient(180deg, #667eea, #764ba2);
            border-radius: 20px 0 0 20px;
        }

        .section-title {
            font-size: 24px;
            font-weight: 800;
            color: #2d3436;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
        }

        .section-icon {
            margin-right: 15px;
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: white;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 25px;
        }

        .info-card {
            background: white;
            padding: 25px;
            border-radius: 16px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
            border: 1px solid #e9ecef;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .info-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
        }

        .info-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }

        .info-header {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }

        .info-emoji {
            font-size: 28px;
            margin-right: 15px;
        }

        .info-title {
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #6c757d;
        }

        .info-content {
            font-size: 18px;
            font-weight: 700;
            color: #2d3436;
            word-break: break-word;
        }

        .highlight {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-weight: 800;
        }

        .timeline-section {
            background: linear-gradient(135deg, #e8f5e8 0%, #f0f9ff 100%);
            border-radius: 20px;
            padding: 35px;
            margin: 35px 0;
            border: 2px solid #c3f0ca;
        }

        .timeline-title {
            font-size: 22px;
            font-weight: 800;
            color: #155724;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
        }

        .timeline-list {
            list-style: none;
            padding: 0;
        }

        .timeline-item {
            display: flex;
            align-items: center;
            margin: 20px 0;
            padding: 15px 0;
            border-bottom: 1px solid #c3f0ca;
        }

        .timeline-item:last-child {
            border-bottom: none;
        }

        .timeline-badge {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 700;
            margin-right: 20px;
            min-width: 120px;
            text-align: center;
        }

        .timeline-text {
            font-size: 16px;
            font-weight: 600;
            color: #155724;
            flex: 1;
        }

        .shop-section {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-radius: 20px;
            padding: 35px;
            margin: 35px 0;
            border: 1px solid #dee2e6;
        }

        .shop-header {
            display: flex;
            align-items: center;
            margin-bottom: 25px;
        }

        .shop-logo {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            color: white;
            margin-right: 20px;
        }

        .shop-name {
            font-size: 24px;
            font-weight: 800;
            color: #2d3436;
        }

        .shop-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }

        .shop-detail {
            display: flex;
            align-items: center;
            padding: 15px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .shop-icon {
            font-size: 20px;
            margin-right: 12px;
            width: 35px;
            text-align: center;
        }

        .shop-text {
            font-size: 15px;
            font-weight: 600;
            color: #495057;
            flex: 1;
        }

        .action-center {
            text-align: center;
            margin: 50px 0;
        }

        .action-title {
            font-size: 20px;
            font-weight: 700;
            color: #2d3436;
            margin-bottom: 30px;
        }

        .action-buttons {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .action-btn {
            display: inline-flex;
            align-items: center;
            padding: 18px 35px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }

        .btn-success {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            box-shadow: 0 10px 25px rgba(40, 167, 69, 0.3);
        }

        .action-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
        }

        .btn-icon {
            margin-right: 12px;
            font-size: 20px;
        }

        .email-footer {
            background: linear-gradient(135deg, #2d3436 0%, #636e72 100%);
            padding: 40px;
            text-align: center;
            color: white;
        }

        .footer-content {
            max-width: 500px;
            margin: 0 auto;
        }

        .footer-brand {
            font-size: 28px;
            font-weight: 800;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .footer-desc {
            font-size: 16px;
            line-height: 1.7;
            opacity: 0.9;
            margin-bottom: 15px;
        }

        .footer-copy {
            font-size: 14px;
            opacity: 0.7;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            .email-container {
                border-radius: 20px;
            }

            .success-header,
            .main-content {
                padding: 30px 25px;
            }

            .success-title {
                font-size: 28px;
            }

            .success-icon {
                font-size: 48px;
            }

            .info-grid {
                grid-template-columns: 1fr;
                gap: 20px;
            }

            .action-buttons {
                flex-direction: column;
                align-items: center;
            }

            .action-btn {
                width: 100%;
                max-width: 300px;
                justify-content: center;
            }

            .shop-details {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="success-header">
            <span class="success-icon">🎉</span>
            <h1 class="success-title">Đặt Lịch Thành Công!</h1>
            <p class="success-subtitle">Cảm ơn bạn đã tin tưởng ${data.shopInfo.name}</p>
            <div class="appointment-badge">
                Mã: ${data.appointmentCode}
            </div>
        </div>

        <div class="main-content">
            <div class="appointment-details">
                <h2 class="section-title">
                    <div class="section-icon">📋</div>
                    Chi Tiết Lịch Hẹn
                </h2>

                <div class="info-grid">
                    <div class="info-card">
                        <div class="info-header">
                            <span class="info-emoji">👤</span>
                            <div class="info-title">Khách Hàng</div>
                        </div>
                        <div class="info-content">${data.customerName}</div>
                    </div>

                    <div class="info-card">
                        <div class="info-header">
                            <span class="info-emoji">📱</span>
                            <div class="info-title">Số Điện Thoại</div>
                        </div>
                        <div class="info-content">${data.customerPhone}</div>
                    </div>

                    <div class="info-card">
                        <div class="info-header">
                            <span class="info-emoji">🔧</span>
                            <div class="info-title">Dịch Vụ</div>
                        </div>
                        <div class="info-content highlight">${data.serviceName}</div>
                    </div>

                    <div class="info-card">
                        <div class="info-header">
                            <span class="info-emoji">📅</span>
                            <div class="info-title">Thời Gian</div>
                        </div>
                        <div class="info-content highlight">${this.formatDate(data.appointmentDate)} - ${data.appointmentTime}</div>
                    </div>

                    <div class="info-card">
                        <div class="info-header">
                            <span class="info-emoji">🚗</span>
                            <div class="info-title">Thông Tin Xe</div>
                        </div>
                        <div class="info-content">${data.vehicleInfo} - ${data.licensePlate}</div>
                    </div>

                    ${data.notes ? `
                    <div class="info-card" style="grid-column: 1 / -1;">
                        <div class="info-header">
                            <span class="info-emoji">📝</span>
                            <div class="info-title">Ghi Chú Đặc Biệt</div>
                        </div>
                        <div class="info-content">${data.notes}</div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="timeline-section">
                <h3 class="timeline-title">
                    🗓️ Lộ Trình Tiếp Theo
                </h3>
                <ul class="timeline-list">
                    <li class="timeline-item">
                        <div class="timeline-badge">15 phút</div>
                        <div class="timeline-text">Chúng tôi sẽ gọi điện xác nhận lịch hẹn với bạn</div>
                    </li>
                    <li class="timeline-item">
                        <div class="timeline-badge">24 giờ trước</div>
                        <div class="timeline-text">Bạn sẽ nhận được SMS/Email nhắc nhở</div>
                    </li>
                    <li class="timeline-item">
                        <div class="timeline-badge">Ngày hẹn</div>
                        <div class="timeline-text">Vui lòng đến đúng giờ và mang theo giấy tờ xe</div>
                    </li>
                </ul>
            </div>

            <div class="shop-section">
                <div class="shop-header">
                    <div class="shop-logo">🏪</div>
                    <div class="shop-name">${data.shopInfo.name}</div>
                </div>

                <div class="shop-details">
                    <div class="shop-detail">
                        <span class="shop-icon">📍</span>
                        <span class="shop-text">${data.shopInfo.address}</span>
                    </div>
                    <div class="shop-detail">
                        <span class="shop-icon">📞</span>
                        <span class="shop-text">${data.shopInfo.phone}</span>
                    </div>
                    <div class="shop-detail">
                        <span class="shop-icon">📧</span>
                        <span class="shop-text">${data.shopInfo.email}</span>
                    </div>
                </div>
            </div>

            <div class="action-center">
                <h3 class="action-title">Cần Hỗ Trợ?</h3>
                <div class="action-buttons">
                    <a href="tel:${data.shopInfo.phone}" class="action-btn btn-success">
                        <span class="btn-icon">📞</span>
                        Gọi Hotline
                    </a>
                    <a href="https://maps.google.com/?q=${encodeURIComponent(data.shopInfo.address)}" class="action-btn btn-primary">
                        <span class="btn-icon">🗺️</span>
                        Xem Đường Đi
                    </a>
                </div>
            </div>
        </div>

        <div class="email-footer">
            <div class="footer-content">
                <div class="footer-brand">${data.shopInfo.name}</div>
                <div class="footer-desc">
                    Garage chuyên nghiệp với đội ngũ kỹ thuật viên giàu kinh nghiệm.<br>
                    Chúng tôi cam kết mang đến dịch vụ tốt nhất cho xế yêu của bạn.
                </div>
                <div class="footer-copy">
                    © 2024 - Tất cả quyền được bảo lưu. Email này được gửi tự động.
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate admin notification HTML email
   */
  private static generateAdminNotificationHTML(data: AdminNotificationData): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lịch Hẹn Mới - ${process.env.APP_NAME}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }

        .email-wrapper {
            max-width: 650px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15);
            position: relative;
        }

        .email-wrapper::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, #ff416c, #ff4b2b, #f093fb, #f5576c);
            background-size: 300% 300%;
            animation: gradient 3s ease infinite;
        }

        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .urgent-header {
            background: linear-gradient(135deg, #ff4757 0%, #c44569 100%);
            position: relative;
            padding: 50px 40px;
            text-align: center;
            color: white;
            overflow: hidden;
        }

        .urgent-header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="80" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="60" r="1" fill="rgba(255,255,255,0.1)"/><circle cx="90" cy="30" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
            animation: float 20s infinite linear;
        }

        @keyframes float {
            0% { transform: translateX(-50%) translateY(-50%) rotate(0deg); }
            100% { transform: translateX(-50%) translateY(-50%) rotate(360deg); }
        }

        .urgent-icon {
            font-size: 48px;
            margin-bottom: 20px;
            display: block;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .urgent-title {
            font-size: 32px;
            font-weight: 800;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .urgent-subtitle {
            background: rgba(255, 255, 255, 0.2);
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 16px;
            font-weight: 600;
            display: inline-block;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .content-section {
            padding: 50px 40px;
            background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        }

        .priority-alert {
            background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
            border: 2px solid #e17055;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 40px;
            position: relative;
            box-shadow: 0 8px 30px rgba(225, 112, 85, 0.2);
        }

        .priority-alert::before {
            content: '⚡';
            position: absolute;
            top: -15px;
            left: 30px;
            background: #e17055;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: bold;
        }

        .alert-title {
            color: #d63031;
            font-weight: 800;
            font-size: 20px;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .alert-text {
            color: #2d3436;
            font-weight: 600;
            font-size: 16px;
            line-height: 1.5;
        }

        .appointment-card {
            background: linear-gradient(135deg, #ffffff 0%, #f1f3f4 100%);
            border-radius: 20px;
            padding: 35px;
            margin: 30px 0;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.08);
            border: 1px solid #e9ecef;
            position: relative;
            overflow: hidden;
        }

        .appointment-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 6px;
            height: 100%;
            background: linear-gradient(180deg, #ff4757, #c44569);
        }

        .customer-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 25px;
            margin-bottom: 25px;
        }

        .info-item {
            display: flex;
            align-items: center;
            padding: 18px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid #e9ecef;
            transition: all 0.3s ease;
        }

        .info-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .info-icon {
            font-size: 24px;
            margin-right: 15px;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .info-content {
            flex: 1;
        }

        .info-label {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #6c757d;
            margin-bottom: 4px;
        }

        .info-value {
            font-size: 16px;
            font-weight: 700;
            color: #2d3436;
            word-break: break-word;
        }

        .appointment-code-section {
            text-align: center;
            margin: 40px 0;
        }

        .code-label {
            font-size: 14px;
            font-weight: 600;
            color: #6c757d;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .appointment-code {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 40px;
            border-radius: 16px;
            font-weight: 800;
            font-size: 24px;
            letter-spacing: 3px;
            text-transform: uppercase;
            display: inline-block;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
            position: relative;
            overflow: hidden;
        }

        .appointment-code::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .action-section {
            margin-top: 50px;
            text-align: center;
        }

        .action-title {
            font-size: 20px;
            font-weight: 700;
            color: #2d3436;
            margin-bottom: 25px;
        }

        .action-buttons {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .action-btn {
            display: inline-flex;
            align-items: center;
            padding: 16px 32px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 700;
            font-size: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            border: none;
            cursor: pointer;
        }

        .btn-call {
            background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
            color: white;
            box-shadow: 0 8px 25px rgba(0, 184, 148, 0.3);
        }

        .btn-dashboard {
            background: linear-gradient(135deg, #0984e3 0%, #74b9ff 100%);
            color: white;
            box-shadow: 0 8px 25px rgba(9, 132, 227, 0.3);
        }

        .action-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
        }

        .action-btn:active {
            transform: translateY(-1px);
        }

        .btn-icon {
            margin-right: 10px;
            font-size: 18px;
        }

        .footer-section {
            background: linear-gradient(135deg, #2d3436 0%, #636e72 100%);
            padding: 40px;
            text-align: center;
            color: white;
        }

        .footer-content {
            max-width: 400px;
            margin: 0 auto;
        }

        .footer-logo {
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 15px;
            color: #74b9ff;
        }

        .footer-text {
            font-size: 14px;
            opacity: 0.8;
            line-height: 1.6;
        }

        @media (max-width: 768px) {
            body {
                padding: 10px;
            }

            .email-wrapper {
                border-radius: 15px;
            }

            .urgent-header,
            .content-section {
                padding: 30px 20px;
            }

            .urgent-title {
                font-size: 24px;
            }

            .urgent-icon {
                font-size: 36px;
            }

            .customer-info {
                grid-template-columns: 1fr;
                gap: 15px;
            }

            .action-buttons {
                flex-direction: column;
                align-items: center;
            }

            .action-btn {
                width: 100%;
                max-width: 300px;
                justify-content: center;
            }

            .appointment-code {
                font-size: 18px;
                padding: 15px 25px;
                letter-spacing: 2px;
            }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="urgent-header">
            <span class="urgent-icon">🚨</span>
            <h1 class="urgent-title">Lịch Hẹn Mới</h1>
            <div class="urgent-subtitle">Cần Xử Lý Ngay Lập Tức</div>
        </div>

        <div class="content-section">
            <div class="priority-alert">
                <div class="alert-title">⚠️ Thông Báo Khẩn Cấp</div>
                <div class="alert-text">
                    Có một lịch hẹn mới vừa được đặt từ khách hàng. Vui lòng kiểm tra thông tin và liên hệ xác nhận trong thời gian sớm nhất.
                </div>
            </div>

            <div class="appointment-card">
                <div class="customer-info">
                    <div class="info-item">
                        <div class="info-icon">👤</div>
                        <div class="info-content">
                            <div class="info-label">Khách Hàng</div>
                            <div class="info-value">${data.customerName}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">📱</div>
                        <div class="info-content">
                            <div class="info-label">Số Điện Thoại</div>
                            <div class="info-value">${data.customerPhone}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">📧</div>
                        <div class="info-content">
                            <div class="info-label">Email</div>
                            <div class="info-value">${data.customerEmail}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">🔧</div>
                        <div class="info-content">
                            <div class="info-label">Dịch Vụ</div>
                            <div class="info-value">${data.serviceName}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">📅</div>
                        <div class="info-content">
                            <div class="info-label">Ngày Hẹn</div>
                            <div class="info-value">${this.formatDate(data.appointmentDate)}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">⏰</div>
                        <div class="info-content">
                            <div class="info-label">Giờ Hẹn</div>
                            <div class="info-value">${data.appointmentTime}</div>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">🚗</div>
                        <div class="info-content">
                            <div class="info-label">Thông Tin Xe</div>
                            <div class="info-value">${data.vehicleInfo} - ${data.licensePlate}</div>
                        </div>
                    </div>
                </div>

                ${data.notes ? `
                <div class="info-item" style="grid-column: 1 / -1;">
                    <div class="info-icon">📝</div>
                    <div class="info-content">
                        <div class="info-label">Ghi Chú Đặc Biệt</div>
                        <div class="info-value">${data.notes}</div>
                    </div>
                </div>
                ` : ''}
            </div>

            <div class="appointment-code-section">
                <div class="code-label">Mã Lịch Hẹn</div>
                <div class="appointment-code">${data.appointmentCode}</div>
            </div>

            <div class="action-section">
                <h3 class="action-title">Hành Động Cần Thực Hiện</h3>
                <div class="action-buttons">
                    <a href="tel:${data.customerPhone}" class="action-btn btn-call">
                        <span class="btn-icon">📞</span>
                        Gọi Ngay
                    </a>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/appointments" class="action-btn btn-dashboard">
                        <span class="btn-icon">📊</span>
                        Quản Lý Lịch Hẹn
                    </a>
                </div>
            </div>
        </div>

        <div class="footer-section">
            <div class="footer-content">
                <div class="footer-logo">${process.env.APP_NAME || 'Car Repair Service'}</div>
                <div class="footer-text">
                    Hệ thống quản lý garage chuyên nghiệp<br>
                    © 2024 - Tất cả quyền được bảo lưu
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate reminder HTML email
   */
  private static generateReminderHTML(data: BookingConfirmationData): string {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nhắc lịch hẹn</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
        .reminder-card { background: white; padding: 20px; border-radius: 8px; border-left: 5px solid #28a745; margin: 15px 0; }
        .checklist { background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; margin: 8px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
        .detail-label { font-weight: bold; color: #666; }
        .detail-value { color: #333; }
        .highlight { color: #28a745; font-weight: bold; }
        .btn { display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔔 Nhắc lịch hẹn ngày mai</h1>
        <p>Mã: ${data.appointmentCode}</p>
    </div>

    <div class="content">
        <div class="reminder-card">
            <h3>📅 Chi tiết lịch hẹn:</h3>
            <div class="detail-row">
                <span class="detail-label">Dịch vụ:</span>
                <span class="detail-value highlight">${data.serviceName}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Thời gian:</span>
                <span class="detail-value highlight">${this.formatDate(data.appointmentDate)} - ${data.appointmentTime}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Xe:</span>
                <span class="detail-value">${data.vehicleInfo} - ${data.licensePlate}</span>
            </div>
        </div>

        <div class="checklist">
            <h3>📋 Checklist chuẩn bị:</h3>
            <ul>
                <li>✅ Mang theo giấy tờ xe (đăng ký, bảo hiểm)</li>
                <li>✅ Kiểm tra xăng còn đủ để đến tiệm</li>
                <li>✅ Lấy đồ cá nhân ra khỏi xe</li>
                <li>✅ Chuẩn bị tiền mặt hoặc thẻ thanh toán</li>
                <li>✅ Đến trước 10 phút để làm thủ tục</li>
            </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="tel:${data.shopInfo.phone}" class="btn">📞 Gọi hotline</a>
            <a href="https://maps.google.com/?q=${encodeURIComponent(data.shopInfo.address)}" class="btn">🗺️ Xem đường đi</a>
        </div>

        <p style="text-align: center; color: #666;">
            Nếu cần thay đổi lịch hẹn, vui lòng gọi: ${data.shopInfo.phone}
        </p>
    </div>
</body>
</html>`;
  }

  /**
   * Format date to Vietnamese format
   */
  private static formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Test email configuration
   */
  static async testConnection(): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }
}