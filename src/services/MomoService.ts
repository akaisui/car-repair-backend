import crypto from 'crypto';
import axios from 'axios';

interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
  redirectUrl: string;
  ipnUrl: string;
}

interface MomoPaymentParams {
  orderId: string;
  amount: number;
  orderInfo: string;
  redirectUrl?: string;
  ipnUrl?: string;
  extraData?: string;
}

interface MomoPaymentResponse {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  responseTime: number;
  message: string;
  resultCode: number;
  payUrl: string;
  deeplink: string;
  qrCodeUrl: string;
}

interface MomoIPNData {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number;
  orderInfo: string;
  orderType: string;
  transId: number;
  resultCode: number;
  message: string;
  payType: string;
  responseTime: number;
  extraData: string;
  signature: string;
}

export class MomoService {
  private static config: MomoConfig = {
    partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMO_PARTNER',
    accessKey: process.env.MOMO_ACCESS_KEY || 'MOMO_ACCESS_KEY',
    secretKey: process.env.MOMO_SECRET_KEY || 'MOMO_SECRET_KEY',
    endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create',
    redirectUrl: process.env.MOMO_REDIRECT_URL || 'http://localhost:3000/api/invoices/momo/callback',
    ipnUrl: process.env.MOMO_IPN_URL || 'http://localhost:3000/api/invoices/momo/ipn'
  };

  /**
   * Create Momo payment
   */
  static async createPayment(params: MomoPaymentParams): Promise<MomoPaymentResponse> {
    const requestId = Date.now().toString();
    const orderId = params.orderId;
    const orderInfo = params.orderInfo;
    const redirectUrl = params.redirectUrl || this.config.redirectUrl;
    const ipnUrl = params.ipnUrl || this.config.ipnUrl;
    const amount = params.amount;
    const extraData = params.extraData || '';
    const requestType = 'payWithATM';

    // Create raw signature
    const rawSignature = [
      'accessKey=' + this.config.accessKey,
      'amount=' + amount,
      'extraData=' + extraData,
      'ipnUrl=' + ipnUrl,
      'orderId=' + orderId,
      'orderInfo=' + orderInfo,
      'partnerCode=' + this.config.partnerCode,
      'redirectUrl=' + redirectUrl,
      'requestId=' + requestId,
      'requestType=' + requestType
    ].join('&');

    // Create signature
    const signature = this.createSignature(rawSignature);

    const requestBody = {
      partnerCode: this.config.partnerCode,
      partnerName: 'Tiệm Sửa Xe',
      storeId: 'MomoTestStore',
      requestId: requestId,
      amount: amount,
      orderId: orderId,
      orderInfo: orderInfo,
      redirectUrl: redirectUrl,
      ipnUrl: ipnUrl,
      lang: 'vi',
      extraData: extraData,
      requestType: requestType,
      signature: signature
    };

    try {
      const response = await axios.post(this.config.endpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      });

      if (response.data.resultCode === 0) {
        return response.data as MomoPaymentResponse;
      } else {
        throw new Error(`Momo payment creation failed: ${response.data.message}`);
      }

    } catch (error: any) {
      if (error.response) {
        throw new Error(`Momo API error: ${error.response.data.message || error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Không thể kết nối đến Momo API');
      } else {
        throw new Error(`Lỗi tạo thanh toán Momo: ${error.message}`);
      }
    }
  }

  /**
   * Verify Momo IPN signature
   */
  static verifyIPN(ipnData: MomoIPNData): boolean {
    // Extract signature from IPN data
    const receivedSignature = ipnData.signature;

    // Create raw signature for verification
    const rawSignature = [
      'accessKey=' + this.config.accessKey,
      'amount=' + ipnData.amount,
      'extraData=' + ipnData.extraData,
      'message=' + ipnData.message,
      'orderId=' + ipnData.orderId,
      'orderInfo=' + ipnData.orderInfo,
      'orderType=' + ipnData.orderType,
      'partnerCode=' + ipnData.partnerCode,
      'payType=' + ipnData.payType,
      'requestId=' + ipnData.requestId,
      'responseTime=' + ipnData.responseTime,
      'resultCode=' + ipnData.resultCode,
      'transId=' + ipnData.transId
    ].join('&');

    // Create expected signature
    const expectedSignature = this.createSignature(rawSignature);

    return receivedSignature === expectedSignature;
  }

  /**
   * Create HMAC SHA256 signature
   */
  private static createSignature(data: string): string {
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Query transaction status from Momo
   */
  static async queryTransaction(orderId: string): Promise<any> {
    const requestId = Date.now().toString();

    // Create raw signature
    const rawSignature = [
      'accessKey=' + this.config.accessKey,
      'orderId=' + orderId,
      'partnerCode=' + this.config.partnerCode,
      'requestId=' + requestId
    ].join('&');

    const signature = this.createSignature(rawSignature);

    const requestBody = {
      partnerCode: this.config.partnerCode,
      requestId: requestId,
      orderId: orderId,
      signature: signature,
      lang: 'vi'
    };

    try {
      const queryEndpoint = process.env.MOMO_QUERY_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/query';

      const response = await axios.post(queryEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return response.data;

    } catch (error: any) {
      if (error.response) {
        throw new Error(`Momo query error: ${error.response.data.message || error.response.statusText}`);
      } else {
        throw new Error(`Lỗi truy vấn giao dịch Momo: ${error.message}`);
      }
    }
  }

  /**
   * Process refund to Momo
   */
  static async processRefund(params: {
    orderId: string;
    requestId?: string;
    amount: number;
    transId: number;
    description?: string;
  }): Promise<any> {
    const requestId = params.requestId || Date.now().toString();
    const description = params.description || 'Refund transaction';

    // Create raw signature
    const rawSignature = [
      'accessKey=' + this.config.accessKey,
      'amount=' + params.amount,
      'description=' + description,
      'orderId=' + params.orderId,
      'partnerCode=' + this.config.partnerCode,
      'requestId=' + requestId,
      'transId=' + params.transId
    ].join('&');

    const signature = this.createSignature(rawSignature);

    const requestBody = {
      partnerCode: this.config.partnerCode,
      requestId: requestId,
      orderId: params.orderId,
      amount: params.amount,
      transId: params.transId,
      description: description,
      signature: signature,
      lang: 'vi'
    };

    try {
      const refundEndpoint = process.env.MOMO_REFUND_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/refund';

      const response = await axios.post(refundEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return response.data;

    } catch (error: any) {
      if (error.response) {
        throw new Error(`Momo refund error: ${error.response.data.message || error.response.statusText}`);
      } else {
        throw new Error(`Lỗi hoàn tiền Momo: ${error.message}`);
      }
    }
  }

  /**
   * Get Momo response message based on result code
   */
  static getResponseMessage(resultCode: number): string {
    const responseCodes: { [key: number]: string } = {
      0: 'Thành công',
      9000: 'Giao dịch được thanh toán thành công. Tiền được cộng vào tài khoản nhận tiền',
      8000: 'Giao dịch đang được xử lý',
      7000: 'Trừ tiền thành công. Giao dịch bị nghi ngờ (Fraud)',
      6000: 'Giao dịch thành công nhưng thất bại khi tiến hành hoàn tiền',
      5000: 'Giao dịch thất bại do lỗi',
      4000: 'Giao dịch bị từ chối bởi MoMo',
      3000: 'Giao dịch bị hủy',
      2000: 'Giao dịch thất bại do số dư tài khoản không đủ',
      1000: 'Giao dịch thất bại do tài khoản người dùng bị khóa',
      11: 'Truy cập bị từ chối',
      12: 'Phiên bản API không được hỗ trợ cho yêu cầu này',
      13: 'Tài khoản doanh nghiệp chưa được kích hoạt',
      20: 'Request đang trong quá trình xử lý, chưa có kết quả trả về',
      21: 'Số tiền không hợp lệ',
      22: 'orderInfo không hợp lệ hoặc chứa ký tự đặc biệt',
      24: 'Đơn hàng không tồn tại',
      25: 'Chữ ký không hợp lệ',
      26: 'Đơn hàng đã tồn tại',
      27: 'Số tiền vượt quá hạn mức giao dịch',
      28: 'Giao dịch bị từ chối bởi issuer',
      29: 'Số lượng giao dịch của khách hàng vượt quá quy định',
      40: 'RequestId không hợp lệ hoặc không được tìm thấy',
      41: 'OrderId không hợp lệ hoặc không được tìm thấy',
      42: 'OrderId và RequestId không khớp',
      43: 'Dữ liệu gửi đi không đúng định dạng',
      99: 'Lỗi không xác định'
    };

    return responseCodes[resultCode] || 'Lỗi không xác định';
  }

  /**
   * Generate QR code for Momo payment
   */
  static generateQRCode(payUrl: string): string {
    // In production, you might want to use a QR code library
    // For now, return the deep link which can be converted to QR code on frontend
    return payUrl;
  }

  /**
   * Check if Momo service is available
   */
  static async checkServiceHealth(): Promise<boolean> {
    try {
      const healthEndpoint = process.env.MOMO_HEALTH_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/health';

      const response = await axios.get(healthEndpoint, {
        timeout: 10000 // 10 seconds timeout
      });

      return response.status === 200;

    } catch (error) {
      return false;
    }
  }

  /**
   * Format amount for Momo (must be integer)
   */
  static formatAmount(amount: number): number {
    return Math.round(amount);
  }

  /**
   * Validate Momo payment amount
   */
  static validateAmount(amount: number): { valid: boolean; message?: string } {
    const minAmount = 1000; // 1,000 VND
    const maxAmount = 50000000; // 50,000,000 VND

    if (amount < minAmount) {
      return {
        valid: false,
        message: `Số tiền tối thiểu là ${minAmount.toLocaleString()} VND`
      };
    }

    if (amount > maxAmount) {
      return {
        valid: false,
        message: `Số tiền tối đa là ${maxAmount.toLocaleString()} VND`
      };
    }

    return { valid: true };
  }
}

export default MomoService;