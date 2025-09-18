import { Router } from 'express';
import { authenticate, requireAdmin, requireStaff } from '../middlewares/auth';
import InvoiceController from '../controllers/InvoiceController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User routes - view own invoices
router.get('/user/:userId', InvoiceController.getUserInvoices);

// Staff routes - basic operations
router.get('/', requireStaff, InvoiceController.getAllInvoices);
router.get('/overdue', requireStaff, InvoiceController.getOverdueInvoices);
router.get('/statistics', requireStaff, InvoiceController.getRevenueStatistics);
router.get('/:id', requireStaff, InvoiceController.getInvoiceById);
router.get('/:id/pdf', requireStaff, InvoiceController.generatePDF);

// Payment processing routes (Staff)
router.post('/:id/payment', requireStaff, InvoiceController.processPayment);
router.post('/:id/vnpay', requireStaff, InvoiceController.createVNPayPayment);
router.post('/:id/momo', requireStaff, InvoiceController.createMomoPayment);
router.post('/payments/:paymentId/refund', requireStaff, InvoiceController.processRefund);

// Payment gateway callbacks (no auth required)
router.get('/vnpay/callback', InvoiceController.handleVNPayCallback);
router.post('/momo/ipn', InvoiceController.handleMomoIPN);

// Admin routes - full CRUD operations
router.post('/', requireAdmin, InvoiceController.createInvoice);
router.put('/:id', requireAdmin, InvoiceController.updateInvoice);
router.delete('/:id', requireAdmin, InvoiceController.deleteInvoice);

export default router;