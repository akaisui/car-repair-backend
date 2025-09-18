import { Router } from 'express';
import UserController from '../controllers/UserController';
import { authenticate } from '../middlewares/auth';

const router = Router();
const userController = new UserController();

// All routes require authentication
router.use(authenticate);

// Push notification routes
router.post('/register-push-token', userController.registerPushToken);
router.delete('/push-token', userController.removePushToken);

// TODO: Implement other user routes
router.get('/', (_req, res) => {
  res.json({ message: 'Users endpoint - Coming soon' });
});

export default router;