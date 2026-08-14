import express from 'express';
import {
  getStockLevels,
  getLowStock,
  getExpiringSoon,
  adjustStock,
  getStockMovements,
  getProductBatches,
} from '../controllers/inventory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/stock-levels', getStockLevels);
router.get('/low-stock', getLowStock);
router.get('/expiring-soon', getExpiringSoon);
router.post('/adjust', authorize('admin', 'manager'), adjustStock);
router.get('/movements', getStockMovements);
router.get('/batches/:productId', getProductBatches);

export default router;
