import { Router } from 'express';
import VehicleController from '../controllers/VehicleController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
const vehicleController = new VehicleController();

// === PUBLIC ROUTES ===

// Public vehicle lookup (for quick searches)
router.get('/license-plate/:license_plate', vehicleController.getVehicleByLicensePlate);
router.post('/validate-license-plate', vehicleController.validateLicensePlate);

// === AUTHENTICATED ROUTES ===

// User vehicle access (users can only access their own vehicles)
router.get('/my-vehicles', authenticate, authorize('customer'), async (req, res, next) => {
  // Set userId from authenticated user
  (req.params as any).userId = req.user?.id?.toString();
  vehicleController.getVehiclesByUser(req, res, next);
});

// === STAFF/ADMIN ROUTES ===

// Vehicle search and filtering
router.get('/search', authenticate, authorize('admin', 'staff'), vehicleController.searchVehicles);
router.get('/brand/:brand', authenticate, authorize('admin', 'staff'), vehicleController.getVehiclesByBrand);
router.get('/by-year', authenticate, authorize('admin', 'staff'), vehicleController.getVehiclesByYear);
router.get('/recent', authenticate, authorize('admin', 'staff'), vehicleController.getRecentVehicles);
router.get('/needing-maintenance', authenticate, authorize('admin', 'staff'), vehicleController.getVehiclesNeedingMaintenance);
router.get('/popular-brands', authenticate, authorize('admin', 'staff'), vehicleController.getPopularBrands);

// Vehicle CRUD operations
router.get('/', authenticate, authorize('admin', 'staff'), vehicleController.getAllVehicles);
router.get('/statistics', authenticate, authorize('admin'), vehicleController.getVehicleStatistics);
router.get('/:id', authenticate, authorize('admin', 'staff'), vehicleController.getVehicleById);

router.post('/', authenticate, authorize('admin', 'staff'), vehicleController.createVehicle);

router.put('/:id', authenticate, authorize('admin', 'staff'), vehicleController.updateVehicle);

router.delete('/:id', authenticate, authorize('admin'), vehicleController.deleteVehicle);

// Vehicle-specific operations
router.get('/user/:userId', authenticate, authorize('admin', 'staff'), vehicleController.getVehiclesByUser);
router.get('/:vehicleId/service-history', authenticate, authorize('admin', 'staff'), vehicleController.getVehicleServiceHistory);
router.get('/:vehicleId/upcoming-appointments', authenticate, authorize('admin', 'staff'), vehicleController.getVehicleUpcomingAppointments);

// Vehicle maintenance operations
router.put('/:vehicleId/update-mileage', authenticate, authorize('admin', 'staff'), vehicleController.updateVehicleMileage);

// Export operations
router.get('/export/list', authenticate, authorize('admin'), vehicleController.exportVehicles);

export default router;