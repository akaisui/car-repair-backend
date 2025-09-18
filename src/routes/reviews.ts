import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'Reviews endpoint - Coming soon' });
});

export default router;