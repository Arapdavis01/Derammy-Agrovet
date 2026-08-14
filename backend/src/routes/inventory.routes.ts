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

// All inventory routes require authentication
router.use(authenticate);

// Stock levels and alerts (viewable by all authenticated users)
router.get('/', getStockLevels);
router.get('/low-stock', getLowStock);
router.get('/expiring-soon', getExpiringSoon);

// Stock movements (viewable by all authenticated users)
router.get('/movements', getStockMovements);

// Product batches for POS (viewable by all authenticated users)
router.get('/batches/:productId', getProductBatches);

// Stock adjustment (admin and manager only)
router.post('/adjust', authorize('admin', 'manager'), adjustStock);

export default router;
