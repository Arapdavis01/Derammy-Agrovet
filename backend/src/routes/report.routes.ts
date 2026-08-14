import express from 'express';
import {
  dailySalesReport,
  monthlySalesReport,
  stockValuationReport,
  profitReport,
  topSellingProducts,
} from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/daily-sales', dailySalesReport);
router.get('/monthly-sales', monthlySalesReport);
router.get('/stock-valuation', stockValuationReport);
router.get('/profit', profitReport);
router.get('/top-products', topSellingProducts);

export default router;
