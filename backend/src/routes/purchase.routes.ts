import express from 'express';
import {
  createPurchase,
  listPurchases,
  getPurchase,
  receivePurchase,
} from '../controllers/purchase.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All purchase routes require authentication
router.use(authenticate);

// Cashiers can create purchase orders (pending)
router.post('/', authorize('admin', 'manager', 'cashier'), createPurchase);

// Cashiers can view purchase list
router.get('/', listPurchases);

// View single purchase
router.get('/:id', getPurchase);

// Receive purchase (admin/manager/cashier)
router.put('/:id/receive', authorize('admin', 'manager', 'cashier'), receivePurchase);

export default router;
