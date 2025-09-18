import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /public/services:
 *   get:
 *     summary: Get all public services (no auth required)
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: List of services
 */
router.get('/services', (_req, res) => {
  res.json({ message: 'Public services endpoint - Coming soon' });
});

/**
 * @swagger
 * /public/contact:
 *   post:
 *     summary: Submit contact form (no auth required)
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: Contact form submitted
 */
router.post('/contact', (_req, res) => {
  res.json({ message: 'Contact endpoint - Coming soon' });
});

export default router;