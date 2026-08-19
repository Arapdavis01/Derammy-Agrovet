import express from 'express';
import {
  createReturn,
  listReturns,
  getReturn,
} from '../controllers/returns.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// All return routes require authentication
router.use(authenticate);

// Create a return/exchange – any authenticated user (cashier, manager, admin)
// The controller enforces additional rules (return window, large returns, non-returnable)
router.post('/', createReturn);

// List returns – viewable by all authenticated users (cashiers see their own in frontend)
router.get('/', listReturns);

// Get single return details
router.get('/:id', getReturn);

export default router;
