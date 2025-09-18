import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import User from '../models/User';

class PushNotificationService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo({
      accessToken: process.env.EXPO_ACCESS_TOKEN, // Optional: for higher rate limits
    });
  }

  /**
   * Send push notification to specific user
   */
  async sendToUser(userId: number, title: string, body: string, data?: any): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.push_token) {
        console.log(`🔔 No push token for user ${userId}`);
        return false;
      }

      return this.sendToToken(user.push_token, title, body, data);
    } catch (error) {
      console.error('Error sending push notification to user:', error);
      return false;
    }
  }

  /**
   * Send push notification to users with specific role
   */
  async sendToRole(role: string, title: string, body: string, data?: any): Promise<number> {
    try {
      const users = await User.findByRoleWithPushToken(role);

      if (users.length === 0) {
        console.log(`🔔 No users with push tokens found for role: ${role}`);
        return 0;
      }

      console.log(`🔔 Sending push notification to ${users.length} ${role} users`);

      const promises = users.map(user =>
        this.sendToToken(user.push_token!, title, body, data)
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(result =>
        result.status === 'fulfilled' && result.value
      ).length;

      console.log(`🔔 Push notification sent successfully to ${successCount}/${users.length} ${role} users`);
      return successCount;

    } catch (error) {
      console.error('Error sending push notification to role:', error);
      return 0;
    }
  }

  /**
   * Send push notification to specific token
   */
  async sendToToken(pushToken: string, title: string, body: string, data?: any): Promise<boolean> {
    try {
      // Check if token is valid
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`🔔 Invalid push token: ${pushToken}`);
        return false;
      }

      const message: ExpoPushMessage = {
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
      };

      const tickets = await this.expo.sendPushNotificationsAsync([message]);
      const ticket = tickets[0];

      if (ticket.status === 'error') {
        console.error(`🔔 Error sending push notification:`, ticket.message);
        return false;
      }

      console.log(`🔔 Push notification sent successfully to ${pushToken}`);
      return true;

    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Send appointment notification to admins
   */
  async sendNewAppointmentNotification(appointmentData: any): Promise<void> {
    try {
      const title = '📅 Lịch hẹn mới';
      const body = `${appointmentData.customer_name} đã đặt lịch hẹn cho dịch vụ ${appointmentData.service_name}`;

      const data = {
        type: 'new_appointment',
        appointment_id: appointmentData.id,
        appointment_code: appointmentData.appointment_code,
        customer_name: appointmentData.customer_name,
        service_name: appointmentData.service_name,
        appointment_date: appointmentData.appointment_date,
        appointment_time: appointmentData.appointment_time,
      };

      // Send to admin and staff
      await Promise.all([
        this.sendToRole('admin', title, body, data),
        this.sendToRole('staff', title, body, data),
      ]);

    } catch (error) {
      console.error('Error sending new appointment push notification:', error);
    }
  }

  /**
   * Send appointment confirmation to customer
   */
  async sendAppointmentConfirmationNotification(userId: number, appointmentData: any, repairCode: string): Promise<void> {
    try {
      const title = '✅ Lịch hẹn đã được xác nhận';
      const body = `Lịch hẹn ${appointmentData.appointment_code} đã được xác nhận và phiếu sửa chữa ${repairCode} đã được tạo.`;

      const data = {
        type: 'appointment_confirmed',
        appointment_id: appointmentData.id,
        appointment_code: appointmentData.appointment_code,
        repair_code: repairCode,
      };

      await this.sendToUser(userId, title, body, data);

    } catch (error) {
      console.error('Error sending appointment confirmation push notification:', error);
    }
  }
}

export default new PushNotificationService();