import express from 'express';
import {
  listCreditCustomers,
  getCustomerLedger,
  recordPayment,
  getOutstandingCredit,
  getCreditAging,
  listPayments, // <-- new import
} from '../controllers/credit.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate);

router.get('/customers', listCreditCustomers);
router.get('/customers/:id/ledger', getCustomerLedger);
router.post('/payments', recordPayment);
router.get('/payments', authorize('admin', 'manager'), listPayments); // <-- new route
router.get('/outstanding', getOutstandingCredit);
router.get('/aging', getCreditAging);

export default router;
