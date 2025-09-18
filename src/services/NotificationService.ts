import nodemailer from 'nodemailer';
// import { AppError } from '../utils';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SMSData {
  to: string;
  message: string;
}

export interface AppointmentReminderData {
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  appointment_date: string;
  appointment_time: string;
  service_name?: string;
  vehicle_info?: string;
  shop_name: string;
  shop_phone: string;
  shop_address: string;
}

/**
 * Notification Service
 * Handles SMS and Email notifications for appointments and other events
 */
export default class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter() {
    try {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      console.log('📧 Email transporter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
    }
  }

  /**
   * Send email notification
   */
  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!this.emailTransporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      const info = await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@carrepair.local',
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
      });

      console.log('📧 Email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send SMS notification (placeholder - integrate with SMS service)
   */
  async sendSMS(smsData: SMSData): Promise<boolean> {
    try {
      // TODO: Integrate with SMS service (Twilio, AWS SNS, local SMS gateway, etc.)
      // For now, just log the SMS
      console.log('📱 SMS would be sent to:', smsData.to);
      console.log('📱 SMS message:', smsData.message);

      // Simulate SMS sending delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      return true;
    } catch (error) {
      console.error('❌ Failed to send SMS:', error);
      return false;
    }
  }

  /**
   * Send appointment reminder via email
   */
  async sendAppointmentReminderEmail(data: AppointmentReminderData): Promise<boolean> {
    if (!data.customer_email) {
      return false;
    }

    const subject = `Nhắc nhở lịch hẹn - ${data.shop_name}`;
    const html = this.generateAppointmentReminderEmailHTML(data);
    const text = this.generateAppointmentReminderEmailText(data);

    return await this.sendEmail({
      to: data.customer_email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send appointment reminder via SMS
   */
  async sendAppointmentReminderSMS(data: AppointmentReminderData): Promise<boolean> {
    if (!data.customer_phone) {
      return false;
    }

    const message = this.generateAppointmentReminderSMSText(data);

    return await this.sendSMS({
      to: data.customer_phone,
      message,
    });
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmationEmail(data: AppointmentReminderData): Promise<boolean> {
    if (!data.customer_email) {
      return false;
    }

    const subject = `Xác nhận lịch hẹn - ${data.shop_name}`;
    const html = this.generateAppointmentConfirmationEmailHTML(data);
    const text = this.generateAppointmentConfirmationEmailText(data);

    return await this.sendEmail({
      to: data.customer_email,
      subject,
      html,
      text,
    });
  }

  /**
   * Send appointment confirmation SMS
   */
  async sendAppointmentConfirmationSMS(data: AppointmentReminderData): Promise<boolean> {
    if (!data.customer_phone) {
      return false;
    }

    const message = `Xác nhận lịch hẹn: ${data.appointment_date} lúc ${data.appointment_time} tại ${data.shop_name}. Hotline: ${data.shop_phone}`;

    return await this.sendSMS({
      to: data.customer_phone,
      message,
    });
  }

  /**
   * Send appointment cancellation notification
   */
  async sendAppointmentCancellationNotification(
    data: AppointmentReminderData,
    reason?: string
  ): Promise<{ email: boolean; sms: boolean }> {
    const results = { email: false, sms: false };

    // Send email
    if (data.customer_email) {
      const subject = `Hủy lịch hẹn - ${data.shop_name}`;
      const html = this.generateAppointmentCancellationEmailHTML(data, reason);
      const text = this.generateAppointmentCancellationEmailText(data, reason);

      results.email = await this.sendEmail({
        to: data.customer_email,
        subject,
        html,
        text,
      });
    }

    // Send SMS
    if (data.customer_phone) {
      const message = `Lịch hẹn ngày ${data.appointment_date} lúc ${data.appointment_time} đã được hủy. ${reason ? `Lý do: ${reason}.` : ''} Liên hệ: ${data.shop_phone}`;

      results.sms = await this.sendSMS({
        to: data.customer_phone,
        message,
      });
    }

    return results;
  }

  /**
   * Generate appointment reminder email HTML
   */
  private generateAppointmentReminderEmailHTML(data: AppointmentReminderData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .appointment-details { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #007bff; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Nhắc nhở lịch hẹn</h1>
            <h2>${data.shop_name}</h2>
          </div>

          <div class="content">
            <p>Xin chào <strong>${data.customer_name}</strong>,</p>

            <p>Đây là lời nhắc nhở về lịch hẹn sắp tới của bạn:</p>

            <div class="appointment-details">
              <h3>📅 Chi tiết lịch hẹn</h3>
              <p><strong>Ngày:</strong> ${this.formatDate(data.appointment_date)}</p>
              <p><strong>Giờ:</strong> ${data.appointment_time}</p>
              ${data.service_name ? `<p><strong>Dịch vụ:</strong> ${data.service_name}</p>` : ''}
              ${data.vehicle_info ? `<p><strong>Xe:</strong> ${data.vehicle_info}</p>` : ''}
            </div>

            <div class="appointment-details">
              <h3>🏪 Thông tin cửa hàng</h3>
              <p><strong>Địa chỉ:</strong> ${data.shop_address}</p>
              <p><strong>Hotline:</strong> ${data.shop_phone}</p>
            </div>

            <p>Vui lòng có mặt đúng giờ để được phục vụ tốt nhất. Nếu cần thay đổi lịch hẹn, xin vui lòng liên hệ trước ít nhất 2 giờ.</p>

            <p>Trân trọng,<br><strong>${data.shop_name}</strong></p>
          </div>

          <div class="footer">
            <p>Email này được gửi tự động từ hệ thống quản lý lịch hẹn của ${data.shop_name}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate appointment reminder email text
   */
  private generateAppointmentReminderEmailText(data: AppointmentReminderData): string {
    return `
      NHẮC NHỞ LỊCH HẸN - ${data.shop_name}

      Xin chào ${data.customer_name},

      Đây là lời nhắc nhở về lịch hẹn sắp tới của bạn:

      CHI TIẾT LỊCH HẸN:
      - Ngày: ${this.formatDate(data.appointment_date)}
      - Giờ: ${data.appointment_time}
      ${data.service_name ? `- Dịch vụ: ${data.service_name}` : ''}
      ${data.vehicle_info ? `- Xe: ${data.vehicle_info}` : ''}

      THÔNG TIN CỬA HÀNG:
      - Địa chỉ: ${data.shop_address}
      - Hotline: ${data.shop_phone}

      Vui lòng có mặt đúng giờ để được phục vụ tốt nhất.

      Trân trọng,
      ${data.shop_name}
    `;
  }

  /**
   * Generate appointment reminder SMS text
   */
  private generateAppointmentReminderSMSText(data: AppointmentReminderData): string {
    return `Nhắc nhở: Bạn có lịch hẹn ngày ${this.formatDate(data.appointment_date)} lúc ${data.appointment_time} tại ${data.shop_name}${data.service_name ? ` - ${data.service_name}` : ''}. Hotline: ${data.shop_phone}`;
  }

  /**
   * Generate appointment confirmation email HTML
   */
  private generateAppointmentConfirmationEmailHTML(data: AppointmentReminderData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .appointment-details { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #28a745; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Xác nhận lịch hẹn</h1>
            <h2>${data.shop_name}</h2>
          </div>

          <div class="content">
            <p>Xin chào <strong>${data.customer_name}</strong>,</p>

            <p>Lịch hẹn của bạn đã được xác nhận thành công!</p>

            <div class="appointment-details">
              <h3>📅 Chi tiết lịch hẹn</h3>
              <p><strong>Ngày:</strong> ${this.formatDate(data.appointment_date)}</p>
              <p><strong>Giờ:</strong> ${data.appointment_time}</p>
              ${data.service_name ? `<p><strong>Dịch vụ:</strong> ${data.service_name}</p>` : ''}
              ${data.vehicle_info ? `<p><strong>Xe:</strong> ${data.vehicle_info}</p>` : ''}
            </div>

            <div class="appointment-details">
              <h3>🏪 Thông tin cửa hàng</h3>
              <p><strong>Địa chỉ:</strong> ${data.shop_address}</p>
              <p><strong>Hotline:</strong> ${data.shop_phone}</p>
            </div>

            <p>Chúng tôi sẽ gửi tin nhắn nhắc nhở trước khi đến lịch hẹn. Cảm ơn bạn đã tin tưởng dịch vụ của chúng tôi!</p>

            <p>Trân trọng,<br><strong>${data.shop_name}</strong></p>
          </div>

          <div class="footer">
            <p>Email này được gửi tự động từ hệ thống quản lý lịch hẹn của ${data.shop_name}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate appointment confirmation email text
   */
  private generateAppointmentConfirmationEmailText(data: AppointmentReminderData): string {
    return `
      XÁC NHẬN LỊCH HẸN - ${data.shop_name}

      Xin chào ${data.customer_name},

      Lịch hẹn của bạn đã được xác nhận thành công!

      CHI TIẾT LỊCH HẸN:
      - Ngày: ${this.formatDate(data.appointment_date)}
      - Giờ: ${data.appointment_time}
      ${data.service_name ? `- Dịch vụ: ${data.service_name}` : ''}
      ${data.vehicle_info ? `- Xe: ${data.vehicle_info}` : ''}

      THÔNG TIN CỬA HÀNG:
      - Địa chỉ: ${data.shop_address}
      - Hotline: ${data.shop_phone}

      Cảm ơn bạn đã tin tưởng dịch vụ của chúng tôi!

      Trân trọng,
      ${data.shop_name}
    `;
  }

  /**
   * Generate appointment cancellation email HTML
   */
  private generateAppointmentCancellationEmailHTML(data: AppointmentReminderData, reason?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .appointment-details { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #dc3545; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Hủy lịch hẹn</h1>
            <h2>${data.shop_name}</h2>
          </div>

          <div class="content">
            <p>Xin chào <strong>${data.customer_name}</strong>,</p>

            <p>Chúng tôi xin thông báo lịch hẹn của bạn đã được hủy:</p>

            <div class="appointment-details">
              <h3>📅 Chi tiết lịch hẹn đã hủy</h3>
              <p><strong>Ngày:</strong> ${this.formatDate(data.appointment_date)}</p>
              <p><strong>Giờ:</strong> ${data.appointment_time}</p>
              ${data.service_name ? `<p><strong>Dịch vụ:</strong> ${data.service_name}</p>` : ''}
              ${data.vehicle_info ? `<p><strong>Xe:</strong> ${data.vehicle_info}</p>` : ''}
              ${reason ? `<p><strong>Lý do:</strong> ${reason}</p>` : ''}
            </div>

            <p>Để đặt lịch hẹn mới, vui lòng liên hệ hotline <strong>${data.shop_phone}</strong> hoặc đặt lịch trực tuyến.</p>

            <p>Chúng tôi xin lỗi về sự bất tiện này và mong được phục vụ bạn trong thời gian sớm nhất!</p>

            <p>Trân trọng,<br><strong>${data.shop_name}</strong></p>
          </div>

          <div class="footer">
            <p>Email này được gửi tự động từ hệ thống quản lý lịch hẹn của ${data.shop_name}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate appointment cancellation email text
   */
  private generateAppointmentCancellationEmailText(data: AppointmentReminderData, reason?: string): string {
    return `
      HỦY LỊCH HẸN - ${data.shop_name}

      Xin chào ${data.customer_name},

      Chúng tôi xin thông báo lịch hẹn của bạn đã được hủy:

      CHI TIẾT LỊCH HẸN ĐÃ HỦY:
      - Ngày: ${this.formatDate(data.appointment_date)}
      - Giờ: ${data.appointment_time}
      ${data.service_name ? `- Dịch vụ: ${data.service_name}` : ''}
      ${data.vehicle_info ? `- Xe: ${data.vehicle_info}` : ''}
      ${reason ? `- Lý do: ${reason}` : ''}

      Để đặt lịch hẹn mới, vui lòng liên hệ hotline ${data.shop_phone}.

      Chúng tôi xin lỗi về sự bất tiện này!

      Trân trọng,
      ${data.shop_name}
    `;
  }

  /**
   * Format date for display
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    };

    return date.toLocaleDateString('vi-VN', options);
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<boolean> {
    if (!this.emailTransporter) {
      return false;
    }

    try {
      await this.emailTransporter.verify();
      console.log('✅ Email configuration is valid');
      return true;
    } catch (error) {
      console.error('❌ Email configuration error:', error);
      return false;
    }
  }
}