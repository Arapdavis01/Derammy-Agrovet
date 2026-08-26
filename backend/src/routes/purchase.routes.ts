import express from 'express';
import {
  createPurchase,
  listPurchases,
  getPurchase,
} from '../controllers/purchase.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All purchase routes require authentication
router.use(authenticate);

// Cashiers can create purchase orders (receive goods)
router.post('/', authorize('admin', 'manager', 'cashier'), createPurchase);

// Cashiers can view purchase list
router.get('/', listPurchases);

// View single purchase
router.get('/:id', getPurchase);

export default router;
