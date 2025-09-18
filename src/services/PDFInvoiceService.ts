import { InvoiceData, InvoiceItem } from '../models/Invoice';

export class PDFInvoiceService {
  private static readonly COMPANY_INFO = {
    name: 'TIỆM SỬA XE HỒNG HẬU',
    address: '123 Đường ABC, Phường XYZ, Quận DEF, TP.HCM',
    phone: '0901234567',
    email: 'contact@suaxemay.com',
    website: 'www.suaxemay.com',
    taxCode: '0123456789',
  };

  /**
   * Generate PDF invoice (placeholder implementation)
   * TODO: Implement with proper PDF library like PDFKit when dependencies are available
   */
  static async generateInvoice(invoice: InvoiceData, items: InvoiceItem[]): Promise<Buffer> {
    // For now, return a simple text-based invoice as Buffer
    const invoiceText = this.generateTextInvoice(invoice, items);
    return Buffer.from(invoiceText, 'utf8');
  }

  /**
   * Generate PDF receipt (placeholder implementation)
   * TODO: Implement with proper PDF library when dependencies are available
   */
  static async generateReceipt(invoice: InvoiceData, items: InvoiceItem[]): Promise<Buffer> {
    // For now, return a simple text-based receipt as Buffer
    const receiptText = this.generateTextReceipt(invoice, items);
    return Buffer.from(receiptText, 'utf8');
  }

  /**
   * Generate text-based invoice
   */
  private static generateTextInvoice(invoice: InvoiceData, items: InvoiceItem[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(60));
    lines.push(`${this.COMPANY_INFO.name.padStart(30)}`);
    lines.push(`${this.COMPANY_INFO.address}`);
    lines.push(`Tel: ${this.COMPANY_INFO.phone} | Email: ${this.COMPANY_INFO.email}`);
    lines.push(`MST: ${this.COMPANY_INFO.taxCode}`);
    lines.push('='.repeat(60));
    lines.push('');

    // Invoice info
    lines.push(`HÓA ĐƠN DỊCH VỤ SỬA CHỮA`.padStart(35));
    lines.push(`Số hóa đơn: ${invoice.invoice_number}`);
    lines.push(`Ngày: ${new Date(invoice.created_at || new Date()).toLocaleDateString('vi-VN')}`);
    lines.push('');

    // Customer info
    lines.push(`Khách hàng: ${invoice.customer_name || 'N/A'}`);
    lines.push(`Địa chỉ: ${invoice.customer_address || 'N/A'}`);
    lines.push(`Điện thoại: ${invoice.customer_phone || 'N/A'}`);
    lines.push('');

    // Items table
    lines.push('-'.repeat(60));
    lines.push('STT | Nội dung                    | SL | Đơn giá      | Thành tiền');
    lines.push('-'.repeat(60));

    items.forEach((item, index) => {
      const stt = (index + 1).toString().padEnd(3);
      const content = item.item_name.substring(0, 24).padEnd(24);
      const qty = item.quantity.toString().padEnd(2);
      const unitPrice = item.unit_price.toLocaleString('vi-VN').padStart(10);
      const total = item.total_price.toLocaleString('vi-VN').padStart(10);
      lines.push(`${stt} | ${content} | ${qty} | ${unitPrice} | ${total}`);
    });

    lines.push('-'.repeat(60));

    // Summary
    lines.push(`Tạm tính: ${invoice.subtotal?.toLocaleString('vi-VN') || '0'} VND`.padStart(60));
    if (invoice.discount_amount && invoice.discount_amount > 0) {
      lines.push(`Giảm giá: -${invoice.discount_amount.toLocaleString('vi-VN')} VND`.padStart(60));
    }
    if (invoice.tax_amount && invoice.tax_amount > 0) {
      lines.push(`Thuế VAT: ${invoice.tax_amount.toLocaleString('vi-VN')} VND`.padStart(60));
    }
    lines.push(`TỔNG CỘNG: ${invoice.total_amount.toLocaleString('vi-VN')} VND`.padStart(60));
    lines.push('');

    // Payment info
    if (invoice.payment_status) {
      lines.push(`Trạng thái thanh toán: ${this.getPaymentStatusText(invoice.payment_status)}`);
    }

    lines.push('');
    lines.push('Cảm ơn quý khách đã sử dụng dịch vụ!');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Generate text-based receipt (simplified version of invoice)
   */
  private static generateTextReceipt(invoice: InvoiceData, items: InvoiceItem[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(40));
    lines.push(`${this.COMPANY_INFO.name}`);
    lines.push(`${this.COMPANY_INFO.phone}`);
    lines.push('='.repeat(40));
    lines.push('');

    // Receipt info
    lines.push(`PHIẾU THANH TOÁN`);
    lines.push(`Số: ${invoice.invoice_number}`);
    lines.push(`Ngày: ${new Date(invoice.created_at || new Date()).toLocaleDateString('vi-VN')}`);
    lines.push('');

    // Customer
    lines.push(`KH: ${invoice.customer_name || 'N/A'}`);
    lines.push(`SĐT: ${invoice.customer_phone || 'N/A'}`);
    lines.push('');

    // Items (simplified)
    lines.push('-'.repeat(40));
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.item_name}`);
      lines.push(
        `   ${item.quantity} x ${item.unit_price.toLocaleString('vi-VN')} = ${item.total_price.toLocaleString('vi-VN')}`
      );
    });
    lines.push('-'.repeat(40));

    // Total
    lines.push(`TỔNG: ${invoice.total_amount.toLocaleString('vi-VN')} VND`);
    lines.push('');
    lines.push('Cảm ơn quý khách!');
    lines.push('='.repeat(40));

    return lines.join('\n');
  }

  /**
   * Get payment status text in Vietnamese
   */
  private static getPaymentStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      pending: 'Chưa thanh toán',
      partial: 'Thanh toán một phần',
      paid: 'Đã thanh toán',
      overdue: 'Quá hạn',
      cancelled: 'Đã hủy',
    };
    return statusMap[status] || status;
  }
}
