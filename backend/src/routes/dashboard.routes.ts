import express from 'express';
import { getAdminDashboard, getCashierDashboard } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/admin', authorize('admin', 'manager'), getAdminDashboard);
router.get('/cashier', getCashierDashboard);

export default router;
