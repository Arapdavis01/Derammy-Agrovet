import express from 'express';
import {
  createReturn,
  listReturns,
  getReturn,
} from '../controllers/returns.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/', createReturn); // cashier can process return? Possibly with permission; but we'll allow for now
router.get('/', listReturns);
router.get('/:id', getReturn);

export default router;
