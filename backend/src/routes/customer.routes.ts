import express from 'express';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customer.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/', listCustomers);
router.get('/:id', getCustomer);
router.post('/', createCustomer); // any authenticated user can create? Usually cashiers can create new customers
router.put('/:id', authorize('admin', 'manager'), updateCustomer);
router.delete('/:id', authorize('admin'), deleteCustomer);

export default router;
