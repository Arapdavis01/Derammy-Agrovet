import express from 'express';
import {
  listCashiers,
  listActiveCashiers,
  createCashier,
  updateCashier,
  deactivateCashier,
  activateCashier,
} from '../controllers/cashier.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Active cashiers (for dropdown) – accessible by any authenticated user
router.get('/active', listActiveCashiers);

// Admin only routes
router.get('/', authorize('admin', 'manager'), listCashiers);
router.post('/', authorize('admin', 'manager'), createCashier);
router.put('/:id', authorize('admin', 'manager'), updateCashier);
router.put('/:id/deactivate', authorize('admin', 'manager'), deactivateCashier);
router.put('/:id/activate', authorize('admin', 'manager'), activateCashier);

export default router;
