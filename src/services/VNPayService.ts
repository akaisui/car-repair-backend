import crypto from 'crypto';
import querystring from 'querystring';

interface VNPayConfig {
  vnp_TmnCode: string;
  vnp_HashSecret: string;
  vnp_Url: string;
  vnp_ReturnUrl: string;
  vnp_Version: string;
  vnp_Command: string;
  vnp_CurrCode: string;
  vnp_Locale: string;
}

interface VNPayPaymentParams {
  orderId: string;
  amount: number;
  orderInfo: string;
  returnUrl?: string;
  bankCode?: string;
  ipAddr?: string;
}

export class VNPayService {
  /**
   * Format date to VNPay format (YYYYMMDDHHmmss)
   */
  private static formatDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Format time to HHmmss
   */
  private static formatTime(date: Date = new Date()): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}${minutes}${seconds}`;
  }
  private static config: VNPayConfig = {
    vnp_TmnCode: process.env.VNPAY_TMN_CODE || 'DEMO',
    vnp_HashSecret: process.env.VNPAY_HASH_SECRET || 'SECRETKEY',
    vnp_Url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    vnp_ReturnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/invoices/vnpay/callback',
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_CurrCode: 'VND',
    vnp_Locale: 'vn'
  };

  /**
   * Create VNPay payment URL
   */
  static createPaymentUrl(params: VNPayPaymentParams): string {
    const date = new Date();
    const createDate = this.formatDate(date);
    const orderId = this.formatTime(date) + '_' + params.orderId;

    const vnpParams: any = {
      vnp_Version: this.config.vnp_Version,
      vnp_Command: this.config.vnp_Command,
      vnp_TmnCode: this.config.vnp_TmnCode,
      vnp_Locale: this.config.vnp_Locale,
      vnp_CurrCode: this.config.vnp_CurrCode,
      vnp_TxnRef: orderId,
      vnp_OrderInfo: params.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: params.amount * 100, // VNPay requires amount in smallest unit
      vnp_ReturnUrl: params.returnUrl || this.config.vnp_ReturnUrl,
      vnp_IpAddr: params.ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate
    };

    // Add bank code if provided
    if (params.bankCode) {
      vnpParams.vnp_BankCode = params.bankCode;
    }

    // Sort params
    const sortedParams = this.sortObject(vnpParams);

    // Create secure hash
    const signData = querystring.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.config.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams.vnp_SecureHash = signed;

    // Create final URL
    const paymentUrl = this.config.vnp_Url + '?' + querystring.stringify(sortedParams);

    return paymentUrl;
  }

  /**
   * Verify VNPay callback signature
   */
  static verifyCallback(vnpParams: any): boolean {
    const secureHash = vnpParams.vnp_SecureHash;

    // Remove hash params
    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    // Sort params
    const sortedParams = this.sortObject(vnpParams);

    // Create signature
    const signData = querystring.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.config.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    return secureHash === signed;
  }

  /**
   * Sort object by keys
   */
  private static sortObject(obj: any): any {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = obj[key];
    }

    return sorted;
  }

  /**
   * Parse VNPay response code
   */
  static getResponseMessage(responseCode: string): string {
    const responseCodes: { [key: string]: string } = {
      '00': 'Giao dịch thành công',
      '01': 'Giao dịch đã tồn tại',
      '02': 'Merchant không hợp lệ',
      '03': 'Dữ liệu gửi sang không đúng định dạng',
      '04': 'Khởi tạo GD không thành công do Website đang bị tạm khóa',
      '05': 'Giao dịch không thành công do: Quý khách nhập sai mật khẩu thanh toán quá số lần quy định',
      '06': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực giao dịch (OTP)',
      '07': 'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường)',
      '09': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking',
      '10': 'Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần',
      '11': 'Giao dịch không thành công do: Đã hết hạn chờ thanh toán',
      '12': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng bị khóa',
      '13': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực giao dịch (OTP)',
      '24': 'Giao dịch không thành công do: Khách hàng hủy giao dịch',
      '51': 'Giao dịch không thành công do: Tài khoản của quý khách không đủ số dư để thực hiện giao dịch',
      '65': 'Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày',
      '75': 'Ngân hàng thanh toán đang bảo trì',
      '79': 'Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán quá số lần quy định',
      '99': 'Lỗi không xác định'
    };

    return responseCodes[responseCode] || 'Lỗi không xác định';
  }

  /**
   * Query transaction status from VNPay
   */
  static async queryTransaction(txnRef: string, transDate: string): Promise<any> {
    const requestId = this.formatTime();
    const orderId = txnRef;

    const vnpParams: any = {
      vnp_RequestId: requestId,
      vnp_Version: this.config.vnp_Version,
      vnp_Command: 'querydr',
      vnp_TmnCode: this.config.vnp_TmnCode,
      vnp_TxnRef: orderId,
      vnp_OrderInfo: 'Query transaction status',
      vnp_TransDate: transDate,
      vnp_CreateDate: this.formatDate(),
      vnp_IpAddr: '127.0.0.1'
    };

    // Sort params
    const sortedParams = this.sortObject(vnpParams);

    // Create secure hash
    const signData = querystring.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.config.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams.vnp_SecureHash = signed;

    // TODO: Make actual API call to VNPay
    // This would require using axios or another HTTP client
    // For now, return mock data
    return {
      success: true,
      message: 'Query would be sent to VNPay API'
    };
  }

  /**
   * Process refund to VNPay
   */
  static async processRefund(params: {
    txnRef: string;
    amount: number;
    transDate: string;
    user: string;
  }): Promise<any> {
    const requestId = this.formatTime();

    const vnpParams: any = {
      vnp_RequestId: requestId,
      vnp_Version: this.config.vnp_Version,
      vnp_Command: 'refund',
      vnp_TmnCode: this.config.vnp_TmnCode,
      vnp_TxnRef: params.txnRef,
      vnp_Amount: params.amount * 100,
      vnp_OrderInfo: 'Refund transaction',
      vnp_TransDate: params.transDate,
      vnp_CreateBy: params.user,
      vnp_CreateDate: this.formatDate(),
      vnp_IpAddr: '127.0.0.1'
    };

    // Sort params
    const sortedParams = this.sortObject(vnpParams);

    // Create secure hash
    const signData = querystring.stringify(sortedParams);
    const hmac = crypto.createHmac('sha512', this.config.vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams.vnp_SecureHash = signed;

    // TODO: Make actual API call to VNPay
    // This would require using axios or another HTTP client
    // For now, return mock data
    return {
      success: true,
      message: 'Refund would be processed through VNPay API'
    };
  }

  /**
   * Get list of supported banks
   */
  static getSupportedBanks(): Array<{ code: string; name: string }> {
    return [
      { code: 'NCB', name: 'Ngân hàng NCB' },
      { code: 'AGRIBANK', name: 'Ngân hàng Agribank' },
      { code: 'SCB', name: 'Ngân hàng SCB' },
      { code: 'SACOMBANK', name: 'Ngân hàng SacomBank' },
      { code: 'EXIMBANK', name: 'Ngân hàng EximBank' },
      { code: 'MSBANK', name: 'Ngân hàng MSBANK' },
      { code: 'NAMABANK', name: 'Ngân hàng NamABank' },
      { code: 'VNMART', name: 'Ví điện tử VnMart' },
      { code: 'VIETINBANK', name: 'Ngân hàng Vietinbank' },
      { code: 'VIETCOMBANK', name: 'Ngân hàng VCB' },
      { code: 'HDBANK', name: 'Ngân hàng HDBank' },
      { code: 'DONGABANK', name: 'Ngân hàng Dong A' },
      { code: 'TPBANK', name: 'Ngân hàng TPBank' },
      { code: 'OJB', name: 'Ngân hàng OceanBank' },
      { code: 'BIDV', name: 'Ngân hàng BIDV' },
      { code: 'TECHCOMBANK', name: 'Ngân hàng Techcombank' },
      { code: 'VPBANK', name: 'Ngân hàng VPBank' },
      { code: 'MBBANK', name: 'Ngân hàng MBBank' },
      { code: 'ACB', name: 'Ngân hàng ACB' },
      { code: 'OCB', name: 'Ngân hàng OCB' },
      { code: 'IVB', name: 'Ngân hàng IVB' },
      { code: 'VISA', name: 'Thanh toán qua VISA/MASTER' }
    ];
  }
}

export default VNPayService;