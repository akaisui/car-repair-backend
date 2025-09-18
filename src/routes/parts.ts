import { Router } from 'express';
import { authenticate, requireAdmin, requireStaff } from '../middlewares/auth';
import PartController from '../controllers/PartController';

const router = Router();
const partController = new PartController();

// Public routes - for customers to search parts
router.get('/search', partController.searchParts);
router.get('/search-by-vehicle', partController.findPartsByVehicle);
// router.get('/categories', partController.getCategories); // TODO: Implement
router.get('/brands', partController.getAvailableBrands);
// router.get('/models/:brand', partController.getModelsByBrand); // TODO: Implement
// router.get('/engine-types/:brand/:model', partController.getEngineTypes); // TODO: Implement
// router.get('/:id/compatibility', partController.getPartCompatibility); // TODO: Implement
router.get('/:id', partController.getPartById);

// Protected routes - require authentication
router.use(authenticate);

// Staff routes - basic operations
router.get('/', requireStaff, partController.getAllParts);
router.get('/:id/stock-movements', requireStaff, partController.getStockMovements);
router.get('/:id/alerts', requireStaff, partController.getInventoryAlerts);
router.post('/:id/stock/add', requireStaff, partController.addStock);
router.post('/:id/stock/remove', requireStaff, partController.removeStock);
router.post('/:id/stock/adjust', requireStaff, partController.adjustStock);
router.post('/:id/alerts/acknowledge', requireStaff, partController.acknowledgeAlert);

// Admin routes - full CRUD operations
router.post('/', requireAdmin, partController.createPart);
router.put('/:id', requireAdmin, partController.updatePart);
router.delete('/:id', requireAdmin, partController.deletePart);
// router.post('/:id/compatibility', requireAdmin, partController.addCompatibility); // TODO: Implement
// router.put('/compatibility/:compatibilityId', requireAdmin, partController.updateCompatibility); // TODO: Implement
// router.delete('/compatibility/:compatibilityId', requireAdmin, partController.deleteCompatibility); // TODO: Implement
// router.post('/:id/compatibility/bulk', requireAdmin, partController.addBulkCompatibility); // TODO: Implement

// Inventory management routes
router.get('/alerts/all', requireStaff, partController.getInventoryAlerts);
// router.post('/alerts/acknowledge-multiple', requireStaff, partController.acknowledgeMultipleAlerts); // TODO: Implement
router.get('/reports/inventory', requireStaff, partController.getInventoryStatistics);
router.get('/reports/stock-movements', requireStaff, partController.getRecentStockMovements);
router.get('/reports/low-stock', requireStaff, partController.getLowStockParts);
router.get('/analytics/inventory', requireStaff, partController.getInventoryStatistics);
// router.get('/analytics/movements', requireStaff, partController.getMovementAnalytics); // TODO: Implement
router.post('/stock-check/perform', requireAdmin, partController.performStockCheck);
router.get('/export', requireStaff, partController.exportParts);

export default router;