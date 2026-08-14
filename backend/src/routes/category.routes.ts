import express from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All category routes require authentication
router.use(authenticate);

router.get('/', listCategories);
router.post('/', authorize('admin', 'manager'), createCategory);
router.put('/:id', authorize('admin', 'manager'), updateCategory);
router.delete('/:id', authorize('admin'), deleteCategory);

export default router;
