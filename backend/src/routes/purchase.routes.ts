import express from 'express';
import {
  createPurchase,
  listPurchases,
  getPurchase,
} from '../controllers/purchase.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/', authorize('admin', 'manager'), createPurchase);
router.get('/', listPurchases);
router.get('/:id', getPurchase);

export default router;
