import express from 'express';
import {
  createSale,
  listSales,
  getSale,
  voidSale,
} from '../controllers/sales.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/', createSale); // cashier/admin/manager can create
router.get('/', listSales);
router.get('/:id', getSale);
router.put('/:id/void', authorize('admin', 'manager'), voidSale); // only admin/manager can void

export default router;
