import express from 'express';
import {
  createSale,
  listSales,
  getSale,
  voidSale,
} from '../controllers/sales.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All sale routes require authentication
router.use(authenticate);

// Create sale – accessible by cashier, manager, admin
router.post('/', createSale);

// List sales – accessible by all authenticated users
// Cashiers see all sales from shared account (with cashier_id filter if needed)
router.get('/', listSales);

// Get single sale details
router.get('/:id', getSale);

// Void sale – only admin/manager
router.put('/:id/void', authorize('admin', 'manager'), voidSale);

export default router;
