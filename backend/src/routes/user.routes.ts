import express from 'express';
import {
  listUsers,
  listCashiers,
  createUser,
  updateUser,
  resetPassword,
  deactivateUser,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Cashier list – accessible by any authenticated user (for POS selection)
router.get('/cashiers', authenticate, listCashiers);

// Admin-only routes
router.use(authenticate, authorize('admin'));
router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.post('/:id/reset-password', resetPassword);
router.put('/:id/deactivate', deactivateUser);

export default router;
