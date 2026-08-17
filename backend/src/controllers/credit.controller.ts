import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List customers with credit balances
export const listCreditCustomers = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, phone, address, credit_limit, credit_balance, status')
    .order('name')
    .not('credit_balance', 'eq', 0);

  if (error) throw new AppError('Failed to fetch credit customers', 500);
  res.json(data);
};

// Get customer ledger (all transactions affecting credit)
export const getCustomerLedger = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Get customer info
  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('id, name, credit_limit, credit_balance')
    .eq('id', id)
    .single();

  if (customerError || !customer) throw new AppError('Customer not found', 404);

  // Get credit sales (where payment_status = 'credit' or method includes credit)
  const { data: sales, error: salesError } = await supabaseAdmin
    .from('sales')
    .select(`
      id, invoice_no, sale_date, total, amount_paid, payment_status, payment_method,
      payments(amount, payment_method, reference, payment_date)
    `)
    .eq('customer_id', id)
    .or('payment_status.eq.credit,payment_method.eq.mixed')
    .order('sale_date', { ascending: false });

  if (salesError) throw new AppError('Failed to fetch credit sales', 500);

  // Get payments received on credit account (not linked to a specific sale)
  const { data: payments, error: paymentsError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('customer_id', id)
    .is('sale_id', null)
    .order('payment_date', { ascending: false });

  if (paymentsError) throw new AppError('Failed to fetch payments', 500);

  // Get returns that affected credit (credit note)
  const { data: returns, error: returnsError } = await supabaseAdmin
    .from('returns')
    .select('id, return_date, total_refund, refund_method')
    .eq('customer_id', id)
    .eq('refund_method', 'credit_note')
    .order('return_date', { ascending: false });

  if (returnsError) throw new AppError('Failed to fetch returns', 500);

  res.json({
    customer,
    sales,
    payments,
    returns,
  });
};

// Record a payment on credit account
export const recordPayment = async (req: Request, res: Response) => {
  const { customer_id, amount, payment_method = 'cash', reference } = req.body;
  const userId = (req as any).user.id;

  if (!customer_id || !amount || amount <= 0) {
    throw new AppError('Customer and positive amount are required', 400);
  }

  // Fetch customer
  const { data: customer, error: fetchError } = await supabaseAdmin
    .from('customers')
    .select('credit_balance')
    .eq('id', customer_id)
    .single();

  if (fetchError || !customer) throw new AppError('Customer not found', 404);

  const currentBalance = Number(customer.credit_balance);
  if (currentBalance <= 0) throw new AppError('Customer has no outstanding balance', 400);

  const paymentAmount = Math.min(currentBalance, amount);
  const newBalance = currentBalance - paymentAmount;

  // Update customer balance
  const { error: updateError } = await supabaseAdmin
    .from('customers')
    .update({ credit_balance: newBalance })
    .eq('id', customer_id);

  if (updateError) throw new AppError('Failed to update customer balance', 500);

  // Record payment
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .insert({
      customer_id,
      amount: paymentAmount,
      payment_method,
      reference,
      user_id: userId,
      sale_id: null, // indicate general payment
    })
    .select()
    .single();

  if (paymentError) {
    // Rollback balance
    await supabaseAdmin.from('customers').update({ credit_balance: currentBalance }).eq('id', customer_id);
    throw new AppError('Failed to record payment', 500);
  }

  res.status(201).json({ payment, new_balance: newBalance });
};

// Get outstanding credit list (customers with balance > 0)
export const getOutstandingCredit = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, phone, credit_limit, credit_balance')
    .gt('credit_balance', 0)
    .order('credit_balance', { ascending: false });

  if (error) throw new AppError('Failed to fetch outstanding credit', 500);
  res.json(data);
};

// Simple credit aging
export const getCreditAging = async (req: Request, res: Response) => {
  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, credit_balance')
    .gt('credit_balance', 0);

  if (error) throw new AppError('Failed to fetch customers', 500);

  const agingData = [];
  for (const cust of customers) {
    const { data: oldestSale } = await supabaseAdmin
      .from('sales')
      .select('sale_date')
      .eq('customer_id', cust.id)
      .eq('payment_status', 'credit')
      .order('sale_date', { ascending: true })
      .limit(1)
      .single();

    const ageDays = oldestSale
      ? Math.floor((Date.now() - new Date(oldestSale.sale_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    let bucket = 'current';
    if (ageDays > 90) bucket = 'over_90';
    else if (ageDays > 60) bucket = '61_90';
    else if (ageDays > 30) bucket = '31_60';
    else if (ageDays > 0) bucket = '1_30';

    agingData.push({
      customer_id: cust.id,
      name: cust.name,
      balance: cust.credit_balance,
      oldest_credit_date: oldestSale?.sale_date || null,
      age_days: ageDays,
      bucket,
    });
  }

  res.json(agingData);
};

// List recent payments (admin/manager)
export const listPayments = async (req: Request, res: Response) => {
  const { limit = 10, offset = 0 } = req.query as any;
  const limitNum = parseInt(limit) || 10;
  const offsetNum = parseInt(offset) || 0;

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select(`
      id,
      amount,
      payment_method,
      reference,
      payment_date,
      customer:customers(id, name),
      user:users(id, full_name)
    `)
    .order('payment_date', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1);

  if (error) throw new AppError('Failed to fetch payments', 500);
  res.json({ data, total: data.length });
};
