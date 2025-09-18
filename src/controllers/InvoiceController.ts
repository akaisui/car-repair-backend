import { Request, Response } from 'express';
import { AppError } from '../utils';
import Invoice, { InvoiceSearchFilters } from '../models/Invoice';
import Payment from '../models/Payment';
import { User } from '../types';

interface AuthRequest extends Request {
  user?: User;
}
import { PDFInvoiceService } from '../services/PDFInvoiceService';
import { VNPayService } from '../services/VNPayService';
import { MomoService } from '../services/MomoService';

export class InvoiceController {
  // Create new invoice
  static async createInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {

      const {
        repair_id,
        user_id,
        subtotal,
        tax_rate,
        discount_amount,
        due_date,
        notes
      } = req.body;

      // If repair_id is provided, create from repair
      let invoiceId: number;
      if (repair_id) {
        invoiceId = await Invoice.createFromRepair(repair_id, {
          tax_rate,
          discount_amount,
          due_date,
          notes
        });
      } else {
        // Create standalone invoice
        const tax_amount = subtotal * ((tax_rate || 10) / 100);
        const total_amount = subtotal + tax_amount - (discount_amount || 0);

        invoiceId = await Invoice.create({
          invoice_number: await Invoice.generateInvoiceNumber(),
          user_id,
          subtotal,
          tax_rate: tax_rate || 10,
          tax_amount,
          discount_amount: discount_amount || 0,
          total_amount,
          payment_status: 'pending',
          due_date,
          notes
        });
      }

      const invoice = await Invoice.findById(invoiceId);

      res.status(201).json({
        success: true,
        data: invoice,
        message: 'Hóa đơn đã được tạo thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tạo hóa đơn'
        });
      }
    }
  }

  // Get all invoices with filters
  static async getAllInvoices(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        user_id,
        repair_id,
        payment_status,
        payment_method,
        date_from,
        date_to,
        invoice_number,
        min_amount,
        max_amount,
        order_by = 'created_at',
        order_direction = 'DESC'
      } = req.query;

      const filters: InvoiceSearchFilters & any = {
        user_id: user_id ? parseInt(user_id as string) : undefined,
        repair_id: repair_id ? parseInt(repair_id as string) : undefined,
        payment_status: payment_status as string,
        payment_method: payment_method as string,
        date_from: date_from as string,
        date_to: date_to as string,
        invoice_number: invoice_number as string,
        min_amount: min_amount ? parseFloat(min_amount as string) : undefined,
        max_amount: max_amount ? parseFloat(max_amount as string) : undefined,
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
        order_by: order_by as string,
        order_direction: order_direction as 'ASC' | 'DESC'
      };

      const [invoices, total] = await Promise.all([
        Invoice.findAll(filters),
        Invoice.count(filters)
      ]);

      const totalPages = Math.ceil(total / parseInt(limit as string));

      res.json({
        success: true,
        data: {
          invoices,
          pagination: {
            current_page: parseInt(page as string),
            total_pages: totalPages,
            total_items: total,
            items_per_page: parseInt(limit as string)
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách hóa đơn'
      });
    }
  }

  // Get invoice by ID
  static async getInvoiceById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const invoice = await Invoice.findById(parseInt(id));

      if (!invoice) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      // Get invoice items
      const items = await Invoice.getInvoiceItems(invoice.id!);

      // Get payment history
      const payments = await Payment.findByInvoiceId(invoice.id!);

      res.json({
        success: true,
        data: {
          ...invoice,
          items,
          payments
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy thông tin hóa đơn'
        });
      }
    }
  }

  // Update invoice
  static async updateInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {

      const { id } = req.params;
      const updateData = req.body;

      // Recalculate total if tax or discount changed
      if (updateData.tax_rate !== undefined || updateData.discount_amount !== undefined) {
        const invoice = await Invoice.findById(parseInt(id));
        if (!invoice) {
          throw new AppError('Không tìm thấy hóa đơn', 404);
        }

        const subtotal = updateData.subtotal || invoice.subtotal;
        const tax_rate = updateData.tax_rate ?? invoice.tax_rate;
        const discount_amount = updateData.discount_amount ?? invoice.discount_amount;

        updateData.tax_amount = subtotal * (tax_rate / 100);
        updateData.total_amount = subtotal + updateData.tax_amount - discount_amount;
      }

      const success = await Invoice.update(parseInt(id), updateData);

      if (!success) {
        throw new AppError('Không tìm thấy hóa đơn hoặc không có dữ liệu để cập nhật', 404);
      }

      const invoice = await Invoice.findById(parseInt(id));

      res.json({
        success: true,
        data: invoice,
        message: 'Hóa đơn đã được cập nhật thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật hóa đơn'
        });
      }
    }
  }

  // Process payment
  static async processPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { payment_method, amount, notes } = req.body;

      const invoice = await Invoice.findById(parseInt(id));
      if (!invoice) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      // Check if amount is valid
      const totalPaid = await Payment.getTotalPayments(invoice.id!);
      const remainingAmount = invoice.total_amount - totalPaid;

      if (amount > remainingAmount) {
        throw new AppError(`Số tiền thanh toán vượt quá số tiền còn lại (${remainingAmount.toLocaleString()} VND)`, 400);
      }

      // Create payment record
      const paymentId = await Payment.create({
        invoice_id: invoice.id!,
        payment_method,
        amount,
        status: payment_method === 'cash' ? 'success' : 'pending',
        payment_date: payment_method === 'cash' ? new Date() : undefined,
        notes
      });

      // If cash payment, mark as successful immediately
      if (payment_method === 'cash') {
        await Payment.updateStatus(paymentId, 'success');
      }

      const payment = await Payment.findById(paymentId);

      res.json({
        success: true,
        data: payment,
        message: 'Thanh toán đã được xử lý'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xử lý thanh toán'
        });
      }
    }
  }

  // Create VNPay payment URL
  static async createVNPayPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { return_url, bank_code } = req.body;

      const invoice = await Invoice.findById(parseInt(id));
      if (!invoice) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      // Check remaining amount
      const totalPaid = await Payment.getTotalPayments(invoice.id!);
      const remainingAmount = invoice.total_amount - totalPaid;

      if (remainingAmount <= 0) {
        throw new AppError('Hóa đơn đã được thanh toán đầy đủ', 400);
      }

      // Create payment record
      const transactionId = Payment.generateTransactionId('VNP');
      const paymentId = await Payment.create({
        invoice_id: invoice.id!,
        transaction_id: transactionId,
        payment_method: 'vnpay',
        amount: remainingAmount,
        status: 'pending'
      });

      // Generate VNPay payment URL
      const paymentUrl = VNPayService.createPaymentUrl({
        orderId: transactionId,
        amount: remainingAmount,
        orderInfo: `Thanh toan hoa don ${invoice.invoice_number}`,
        returnUrl: return_url || process.env.VNPAY_RETURN_URL!,
        bankCode: bank_code
      });

      res.json({
        success: true,
        data: {
          payment_id: paymentId,
          payment_url: paymentUrl,
          transaction_id: transactionId
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tạo thanh toán VNPay'
        });
      }
    }
  }

  // Handle VNPay callback
  static async handleVNPayCallback(req: Request, res: Response): Promise<void> {
    try {
      const vnpParams = req.query;

      // Verify VNPay signature
      const isValid = VNPayService.verifyCallback(vnpParams);

      if (!isValid) {
        throw new AppError('Chữ ký không hợp lệ', 400);
      }

      const transactionId = vnpParams.vnp_TxnRef as string;
      const responseCode = vnpParams.vnp_ResponseCode as string;

      // Find payment by transaction ID
      const payment = await Payment.findByTransactionId(transactionId);
      if (!payment) {
        throw new AppError('Không tìm thấy giao dịch', 404);
      }

      // Update payment status based on response code
      if (responseCode === '00') {
        await Payment.updateStatus(payment.id!, 'success', JSON.stringify(vnpParams));
      } else {
        await Payment.updateStatus(payment.id!, 'failed', JSON.stringify(vnpParams));
      }

      res.json({
        success: responseCode === '00',
        message: responseCode === '00' ? 'Thanh toán thành công' : 'Thanh toán thất bại',
        data: {
          transaction_id: transactionId,
          response_code: responseCode
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xử lý callback VNPay'
        });
      }
    }
  }

  // Create Momo payment
  static async createMomoPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { redirect_url, ipn_url } = req.body;

      const invoice = await Invoice.findById(parseInt(id));
      if (!invoice) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      // Check remaining amount
      const totalPaid = await Payment.getTotalPayments(invoice.id!);
      const remainingAmount = invoice.total_amount - totalPaid;

      if (remainingAmount <= 0) {
        throw new AppError('Hóa đơn đã được thanh toán đầy đủ', 400);
      }

      // Create payment record
      const transactionId = Payment.generateTransactionId('MOMO');
      const paymentId = await Payment.create({
        invoice_id: invoice.id!,
        transaction_id: transactionId,
        payment_method: 'momo',
        amount: remainingAmount,
        status: 'pending'
      });

      // Create Momo payment
      const momoResponse = await MomoService.createPayment({
        orderId: transactionId,
        amount: remainingAmount,
        orderInfo: `Thanh toan hoa don ${invoice.invoice_number}`,
        redirectUrl: redirect_url || process.env.MOMO_REDIRECT_URL!,
        ipnUrl: ipn_url || process.env.MOMO_IPN_URL!
      });

      res.json({
        success: true,
        data: {
          payment_id: paymentId,
          payment_url: momoResponse.payUrl,
          transaction_id: transactionId,
          qr_code: momoResponse.qrCodeUrl
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tạo thanh toán Momo'
        });
      }
    }
  }

  // Handle Momo IPN callback
  static async handleMomoIPN(req: Request, res: Response): Promise<void> {
    try {
      const ipnData = req.body;

      // Verify Momo signature
      const isValid = MomoService.verifyIPN(ipnData);

      if (!isValid) {
        res.status(400).json({ message: 'Invalid signature' });
        return;
      }

      const transactionId = ipnData.orderId;
      const resultCode = ipnData.resultCode;

      // Find payment by transaction ID
      const payment = await Payment.findByTransactionId(transactionId);
      if (!payment) {
        res.status(404).json({ message: 'Transaction not found' });
        return;
      }

      // Update payment status based on result code
      if (resultCode === 0) {
        await Payment.updateStatus(payment.id!, 'success', JSON.stringify(ipnData));
      } else {
        await Payment.updateStatus(payment.id!, 'failed', JSON.stringify(ipnData));
      }

      res.status(204).send();

    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Process refund
  static async processRefund(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { amount, notes } = req.body;

      const refundId = await Payment.processRefund(
        parseInt(paymentId),
        amount,
        notes
      );

      const refund = await Payment.findById(refundId);

      res.json({
        success: true,
        data: refund,
        message: 'Hoàn tiền đã được xử lý thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xử lý hoàn tiền'
        });
      }
    }
  }

  // Generate PDF invoice
  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const invoice = await Invoice.findById(parseInt(id));
      if (!invoice) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      // Get invoice items
      const items = await Invoice.getInvoiceItems(invoice.id!);

      // Generate PDF
      const pdfBuffer = await PDFInvoiceService.generateInvoice(invoice, items);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);

      res.send(pdfBuffer);

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tạo PDF hóa đơn'
        });
      }
    }
  }

  // Get revenue statistics
  static async getRevenueStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { date_from, date_to, period = 'daily' } = req.query;

      // Get revenue summary
      const summary = await Invoice.getRevenueSummary(
        date_from as string,
        date_to as string
      );

      // Get revenue by period
      let periodData;
      if (period === 'monthly') {
        const year = req.query.year ? parseInt(req.query.year as string) : undefined;
        periodData = await Invoice.getMonthlyRevenue(year);
      } else {
        const days = req.query.days ? parseInt(req.query.days as string) : 30;
        periodData = await Invoice.getDailyRevenue(days);
      }

      // Get payment statistics
      const paymentSummary = await Payment.getPaymentSummary(
        date_from as string,
        date_to as string
      );

      res.json({
        success: true,
        data: {
          summary,
          period_data: periodData,
          payment_summary: paymentSummary
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thống kê doanh thu'
      });
    }
  }

  // Get overdue invoices
  static async getOverdueInvoices(_req: Request, res: Response): Promise<void> {
    try {
      const overdueInvoices = await Invoice.getOverdueInvoices();

      res.json({
        success: true,
        data: overdueInvoices
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách hóa đơn quá hạn'
      });
    }
  }

  // Get user invoices
  static async getUserInvoices(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit = 20 } = req.query;

      const invoices = await Invoice.getUserInvoices(
        parseInt(userId),
        parseInt(limit as string)
      );

      const totalOwed = await Invoice.getTotalOwed(parseInt(userId));

      res.json({
        success: true,
        data: {
          invoices,
          total_owed: totalOwed
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy hóa đơn của khách hàng'
      });
    }
  }

  // Delete invoice
  static async deleteInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Check if invoice has payments
      const payments = await Payment.findByInvoiceId(parseInt(id));
      if (payments.some(p => p.status === 'success')) {
        throw new AppError('Không thể xóa hóa đơn đã có thanh toán thành công', 400);
      }

      const success = await Invoice.delete(parseInt(id));

      if (!success) {
        throw new AppError('Không tìm thấy hóa đơn', 404);
      }

      res.json({
        success: true,
        message: 'Hóa đơn đã được xóa thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xóa hóa đơn'
        });
      }
    }
  }
}

export default InvoiceController;