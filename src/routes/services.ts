import { Router } from 'express';
import ServiceController from '../controllers/ServiceController';
import ServiceCategoryController from '../controllers/ServiceCategoryController';
import { authenticate, authorize } from '../middlewares/auth';
import multer from 'multer';

const router = Router();
const serviceController = new ServiceController();
const serviceCategoryController = new ServiceCategoryController();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WebP images are allowed'));
    }
  }
});

// === SERVICE CATEGORY ROUTES ===

// Public routes for service categories
router.get('/categories/active', serviceCategoryController.getActiveCategories);
router.get('/categories/with-count', serviceCategoryController.getCategoriesWithServiceCount);
router.get('/categories/classification/:classification', serviceCategoryController.getCategoriesByClassification);
router.get('/categories/predefined', serviceCategoryController.getPredefinedCategories);
router.get('/categories/slug/:slug', serviceCategoryController.getCategoryBySlug);

// Admin routes for service categories
router.get('/categories', authenticate, authorize('admin', 'staff'), serviceCategoryController.getAllCategories);
router.get('/categories/statistics', authenticate, authorize('admin'), serviceCategoryController.getCategoryStatistics);
router.get('/categories/next-sort-order', authenticate, authorize('admin', 'staff'), serviceCategoryController.getNextSortOrder);
router.get('/categories/:id', authenticate, authorize('admin', 'staff'), serviceCategoryController.getCategoryById);

router.post('/categories', authenticate, authorize('admin'), serviceCategoryController.createCategory);
router.post('/categories/initialize-default', authenticate, authorize('admin'), serviceCategoryController.initializeDefaultCategories);

router.put('/categories/:id', authenticate, authorize('admin'), serviceCategoryController.updateCategory);
router.put('/categories/sort-order', authenticate, authorize('admin'), serviceCategoryController.updateSortOrder);
router.put('/categories/reorder', authenticate, authorize('admin'), serviceCategoryController.reorderCategories);
router.put('/categories/:id/toggle-active', authenticate, authorize('admin'), serviceCategoryController.toggleActive);

router.delete('/categories/:id', authenticate, authorize('admin'), serviceCategoryController.deleteCategory);

// === SERVICE ROUTES ===

// Public routes for services
router.get('/search', serviceController.searchServices);
router.get('/featured', serviceController.getFeaturedServices);
router.get('/popular', serviceController.getPopularServices);
router.get('/with-pricing', serviceController.getServicesWithPricing);
router.get('/active', serviceController.getActiveServices); // Public route for active services
router.get('/statistics', serviceController.getServiceStatistics); // Made public for frontend
router.get('/classification/:classification', serviceController.getServicesByClassification);
router.get('/category/:categoryId', serviceController.getServicesByCategory);
router.get('/slug/:slug', serviceController.getServiceBySlug);

// Admin/Staff routes for services
router.get('/', authenticate, authorize('admin', 'staff'), serviceController.getAllServices);
router.get('/:id', authenticate, authorize('admin', 'staff'), serviceController.getServiceById);

router.post('/', authenticate, authorize('admin'), serviceController.createService);

router.put('/:id', authenticate, authorize('admin'), serviceController.updateService);
router.put('/:id/pricing', authenticate, authorize('admin'), serviceController.updateServicePricing);
router.put('/:id/toggle-featured', authenticate, authorize('admin'), serviceController.toggleFeatured);
router.put('/bulk/status', authenticate, authorize('admin'), serviceController.bulkUpdateStatus);

router.post('/:id/upload-image',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  serviceController.uploadServiceImage
);

router.delete('/:id', authenticate, authorize('admin'), serviceController.deleteService);

export default router;