import { Router } from 'express';
import { authenticate, requireAdmin, requireStaff } from '../middlewares/auth';
import RepairController from '../controllers/RepairController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Public routes for customers (read-only)
router.get('/history', RepairController.getRepairHistory);
router.get('/summary', RepairController.getRepairSummary);
router.get('/status/:status', RepairController.getRepairsByStatus);

// Staff routes - basic operations
router.get('/', requireStaff, RepairController.getAllRepairs);
router.get('/:id', requireStaff, RepairController.getRepairById);
router.get('/mechanic/:mechanic_id', requireStaff, RepairController.getMechanicRepairs);
router.post('/:id/calculate-costs', requireStaff, RepairController.calculateCosts);

// Staff routes - status and assignment management
router.put('/:id/status', requireStaff, RepairController.updateStatus);
router.put('/:id/assign-mechanic', requireStaff, RepairController.assignMechanic);

// Staff routes - services and parts management
router.post('/:id/services', requireStaff, RepairController.addService);
router.put('/:id/services/:serviceId', requireStaff, RepairController.updateService);
router.delete('/:id/services/:serviceId', requireStaff, RepairController.removeService);

router.post('/:id/parts', requireStaff, RepairController.addPart);
router.put('/:id/parts/:partId', requireStaff, RepairController.updatePart);
router.delete('/:id/parts/:partId', requireStaff, RepairController.removePart);

// Admin routes - full CRUD operations
router.post('/', requireAdmin, RepairController.createRepair);
router.put('/:id', requireAdmin, RepairController.updateRepair);
router.delete('/:id', requireAdmin, RepairController.deleteRepair);

export default router;