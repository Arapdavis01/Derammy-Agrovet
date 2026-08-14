import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';
import { reduceStock, addStock } from '../services/stock.service';
import { v4 as uuidv4 } from 'uuid';

// Generate invoice number: INV-YYYYMMDD-XXXX
const generateInvoiceNo = async (): Promise<string> => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  // Count sales today for sequence
  const { count, error } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .gte('sale_date', `${dateStr}T00:00:00Z`)
    .lt('sale_date', `${dateStr}T23:59:59Z`);

  if (error) throw new AppError('Failed to generate invoice number', 500);
  const sequence = String((count || 0) + 1).padStart(4, '0');
  return `INV-${dateStr}-${sequence}`;
};

// Create a new sale
export const createSale = async (req: Request, res: Response) => {
  const {
    customer_id,
    items, // [{ product_id, quantity, unit_price?, discount?, batch_id? }]
    payment_method, // 'cash', 'mpesa', 'credit', 'mixed'
    payments, // for mixed: [{ method, amount, reference? }]
    discount = 0, // total discount
    tax = 0,
    sale_status = 'completed',
  } = req.body;

  const userId = (req as any).user.id;

  if (!items || items.length === 0) throw new AppError('No items provided', 400);
  if (!payment_method) throw new AppError('Payment method required', 400);

  // Start building sale
  let subtotal = 0;
  const saleItemsData = [];

  // Validate each item, calculate line totals
  for (const item of items) {
    const { product_id, quantity, unit_price, discount: lineDiscount = 0, batch_id } = item;
    if (!product_id || !quantity || quantity <= 0) {
      throw new AppError('Invalid item data', 400);
    }

    // Fetch product to get current selling price (if unit_price not provided)
    let price = unit_price;
    if (!price) {
      const { data: product } = await supabase
        .from('products')
        .select('selling_price')
        .eq('id', product_id)
        .single();
      if (!product) throw new AppError(`Product not found: ${product_id}`, 404);
      price = product.selling_price;
    }

    const lineTotal = Number(quantity) * Number(price) - Number(lineDiscount);
    subtotal += lineTotal;
    saleItemsData.push({
      product_id,
      quantity,
      unit_price: price,
      discount: lineDiscount,
      total: lineTotal,
      batch_id,
    });
  }

  // Apply total discount and tax
  const totalAfterDiscount = subtotal - discount;
  const total = totalAfterDiscount + tax;

  // Validate payment(s)
  let totalPaid = 0;
  let paymentStatus = 'paid';
  let amountPaid = 0;
  let changeDue = 0;

  if (payment_method === 'mixed') {
    if (!payments || payments.length === 0) throw new AppError('Mixed payment requires payment details', 400);
    for (const p of payments) {
      totalPaid += Number(p.amount);
    }
    if (Math.abs(totalPaid - total) > 0.01) {
      throw new AppError('Total payments do not match sale total', 400);
    }
    amountPaid = total;
  } else if (payment_method === 'credit') {
    // Credit sale: no immediate payment, customer required
    if (!customer_id) throw new AppError('Credit sale requires a customer', 400);
    paymentStatus = 'credit';
    amountPaid = 0;
  } else if (payment_method === 'cash' || payment_method === 'mpesa') {
    // Single payment: amount_paid is provided if cash (to calculate change), for mpesa assume exact
    if (payment_method === 'cash' && req.body.amount_received) {
      amountPaid = Number(req.body.amount_received);
      if (amountPaid < total) throw new AppError('Insufficient cash received', 400);
      changeDue = amountPaid - total;
    } else {
      amountPaid = total; // Assume exact for mpesa or cash without change
    }
  } else {
    throw new AppError('Invalid payment method', 400);
  }

  // If credit sale, check customer credit limit
  if (payment_method === 'credit' || payment_method === 'mixed') {
    if (customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('credit_limit, credit_balance')
        .eq('id', customer_id)
        .single();
      if (!customer) throw new AppError('Customer not found', 404);
      if (Number(customer.credit_balance) + total > Number(customer.credit_limit)) {
        throw new AppError('Customer credit limit exceeded', 400);
      }
    }
  }

  // Generate invoice number
  const invoice_no = await generateInvoiceNo();

  // Insert sale record
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      invoice_no,
      customer_id: customer_id || null,
      user_id: userId,
      subtotal,
      discount,
      tax,
      total,
      amount_paid: amountPaid,
      change_due: changeDue,
      payment_status: paymentStatus,
      sale_status,
      payment_method,
    })
    .select()
    .single();

  if (saleError) throw new AppError('Failed to create sale', 500);

  // Insert sale items and reduce stock
  for (const item of saleItemsData) {
    // Insert sale item
    const { error: itemError } = await supabase
      .from('sale_items')
      .insert({
        sale_id: sale.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: item.total,
      });

    if (itemError) {
      // Rollback sale and any already inserted items? For simplicity, we'll attempt to void sale.
      await supabase.from('sales').delete().eq('id', sale.id);
      throw new AppError('Failed to insert sale items', 500);
    }

    // Reduce stock
    try {
      await reduceStock(item.product_id, item.quantity, item.batch_id, userId, sale.id);
    } catch (e: any) {
      // If stock reduction fails, we should rollback sale and sale items
      await supabase.from('sales').delete().eq('id', sale.id);
      throw e;
    }
  }

  // Insert payments
  if (payment_method === 'mixed') {
    for (const p of payments) {
      await supabase.from('payments').insert({
        sale_id: sale.id,
        customer_id: customer_id || null,
        amount: p.amount,
        payment_method: p.method,
        reference: p.reference,
      });
    }
  } else if (payment_method !== 'credit') {
    // Record single payment
    await supabase.from('payments').insert({
      sale_id: sale.id,
      customer_id: customer_id || null,
      amount: total,
      payment_method,
      reference: req.body.reference || null,
    });
  }

  // If credit sale or mixed with credit component, update customer balance
  if (payment_status === 'credit' || (payment_method === 'mixed' && payments.some((p: any) => p.method === 'credit'))) {
    const creditAmount = total - (payments && payments.length ? payments.filter((p: any) => p.method === 'credit').reduce((sum: number, p: any) => sum + p.amount, 0) : total);
    const { data: customer } = await supabase
      .from('customers')
      .select('credit_balance')
      .eq('id', customer_id)
      .single();
    if (customer) {
      const newBalance = Number(customer.credit_balance) + creditAmount;
      await supabase.from('customers').update({ credit_balance: newBalance }).eq('id', customer_id);
    }
  }

  // Fetch complete sale with items
  const { data: fullSale, error: fetchError } = await supabase
    .from('sales')
    .select(`
      *,
      customer:customers(id, name),
      sale_items(
        id, product_id, batch_id, quantity, unit_price, discount, total,
        product:products(id, name, unit)
      ),
      payments(*)
    `)
    .eq('id', sale.id)
    .single();

  if (fetchError) throw new AppError('Sale created but failed to retrieve details', 500);

  res.status(201).json(fullSale);
};

// List sales with filters
export const listSales = async (req: Request, res: Response) => {
  const { start_date, end_date, user_id, customer_id, payment_method, sale_status, page = 1, limit = 50 } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('sales')
    .select(`
      id, invoice_no, customer_id, user_id, sale_date, subtotal, discount, tax, total, amount_paid, payment_status, sale_status, payment_method,
      customer:customers(id, name),
      user:users(id, full_name)
    `, { count: 'exact' })
    .order('sale_date', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (start_date) query = query.gte('sale_date', start_date);
  if (end_date) query = query.lte('sale_date', end_date);
  if (user_id) query = query.eq('user_id', user_id);
  if (customer_id) query = query.eq('customer_id', customer_id);
  if (payment_method) query = query.eq('payment_method', payment_method);
  if (sale_status) query = query.eq('sale_status', sale_status);

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch sales', 500);
  res.json({ data, total: count || 0, page: pageNum, limit: limitNum, totalPages: Math.ceil((count || 0) / limitNum) });
};

// Get sale details
export const getSale = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      customer:customers(id, name),
      user:users(id, full_name),
      sale_items(
        id, product_id, batch_id, quantity, unit_price, discount, total,
        product:products(id, name, unit),
        batch:stock_batches(id, batch_number, expiry_date)
      ),
      payments(*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) throw new AppError('Sale not found', 404);
  res.json(data);
};

// Void sale
export const voidSale = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = (req as any).user.id;

  // Fetch sale
  const { data: sale, error: fetchError } = await supabase
    .from('sales')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !sale) throw new AppError('Sale not found', 404);
  if (sale.sale_status === 'voided') throw new AppError('Sale already voided', 400);
  if (sale.sale_status === 'refunded') throw new AppError('Sale already refunded', 400);

  // Restock items
  const { data: items } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', id);

  if (items) {
    for (const item of items) {
      await addStock(
        item.product_id,
        item.quantity,
        item.batch_id,
        undefined,
        undefined,
        undefined,
        userId,
        id
      );
    }
  }

  // Reverse credit if credit sale
  if (sale.payment_status === 'credit' || sale.payment_method === 'mixed') {
    if (sale.customer_id) {
      const creditAmount = sale.total - sale.amount_paid; // amount unpaid
      const { data: customer } = await supabase
        .from('customers')
        .select('credit_balance')
        .eq('id', sale.customer_id)
        .single();
      if (customer) {
        const newBalance = Number(customer.credit_balance) - creditAmount;
        await supabase.from('customers').update({ credit_balance: newBalance }).eq('id', sale.customer_id);
      }
    }
  }

  // Update sale status
  const { error: updateError } = await supabase
    .from('sales')
    .update({ sale_status: 'voided' })
    .eq('id', id);

  if (updateError) throw new AppError('Failed to void sale', 500);

  res.json({ message: 'Sale voided successfully', sale_id: id });
};
