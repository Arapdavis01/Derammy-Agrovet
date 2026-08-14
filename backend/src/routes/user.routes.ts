import express from 'express';
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deactivateUser,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All user routes require authentication and admin role
router.use(authenticate, authorize('admin'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.post('/:id/reset-password', resetPassword);
router.put('/:id/deactivate', deactivateUser);

export default router;
