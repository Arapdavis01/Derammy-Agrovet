import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';
import { addStock } from '../services/stock.service';

// Create a return for a sale
export const createReturn = async (req: Request, res: Response) => {
  const {
    sale_id,
    items, // [{ sale_item_id, quantity, reason, condition }]
    refund_method = 'cash',
  } = req.body;

  const userId = (req as any).user.id;

  if (!sale_id) throw new AppError('Sale ID is required', 400);
  if (!items || items.length === 0) throw new AppError('No items to return', 400);

  // Fetch sale
  const { data: sale, error: saleError } = await supabaseAdmin
    .from('sales')
    .select('*')
    .eq('id', sale_id)
    .single();

  if (saleError || !sale) throw new AppError('Sale not found', 404);
  if (sale.sale_status === 'voided') throw new AppError('Sale is voided', 400);
  if (sale.sale_status === 'refunded') throw new AppError('Sale already refunded', 400);

  // Fetch sale items
  const { data: saleItems, error: itemsError } = await supabaseAdmin
    .from('sale_items')
    .select('*')
    .eq('sale_id', sale_id);

  if (itemsError) throw new AppError('Failed to fetch sale items', 500);

  // Validate requested items and calculate refund total
  let totalRefund = 0;
  const returnItemsData = [];

  for (const returnItem of items) {
    const saleItem = saleItems.find((si: any) => si.id === returnItem.sale_item_id);
    if (!saleItem) throw new AppError(`Sale item not found: ${returnItem.sale_item_id}`, 404);

    if (returnItem.quantity <= 0 || returnItem.quantity > saleItem.quantity) {
      throw new AppError(`Invalid quantity for item ${saleItem.product_id}`, 400);
    }

    const lineRefund = (saleItem.unit_price * returnItem.quantity) - (saleItem.discount * (returnItem.quantity / saleItem.quantity));
    totalRefund += lineRefund;

    returnItemsData.push({
      sale_item_id: saleItem.id,
      product_id: saleItem.product_id,
      batch_id: saleItem.batch_id,
      quantity: returnItem.quantity,
      condition: returnItem.condition || 'resellable',
      refund_amount: lineRefund,
      reason: returnItem.reason || '',
    });
  }

  // Insert return record
  const { data: returnRecord, error: returnError } = await supabaseAdmin
    .from('returns')
    .insert({
      sale_id,
      customer_id: sale.customer_id,
      user_id: userId,
      reason: req.body.reason || '',
      total_refund: totalRefund,
      refund_method,
      status: 'completed',
    })
    .select()
    .single();

  if (returnError) throw new AppError('Failed to create return', 500);

  // Process each return item
  for (const item of returnItemsData) {
    // Insert return item
    const { error: insertItemError } = await supabaseAdmin
      .from('return_items')
      .insert({
        return_id: returnRecord.id,
        sale_item_id: item.sale_item_id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        condition: item.condition,
        refund_amount: item.refund_amount,
      });

    if (insertItemError) {
      // Rollback return
      await supabaseAdmin.from('returns').delete().eq('id', returnRecord.id);
      throw new AppError('Failed to insert return item', 500);
    }

    // Restock if resellable
    if (item.condition === 'resellable') {
      try {
        await addStock(
          item.product_id,
          item.quantity,
          item.batch_id,
          undefined,
          undefined,
          undefined,
          userId,
          returnRecord.id
        );
      } catch (e: any) {
        await supabaseAdmin.from('returns').delete().eq('id', returnRecord.id);
        throw e;
      }
    }
  }

  // If credit sale or had credit component, reduce customer balance if credit note
  if (sale.payment_status === 'credit' || sale.payment_method === 'mixed') {
    if (refund_method === 'credit_note' && sale.customer_id) {
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('credit_balance')
        .eq('id', sale.customer_id)
        .single();
      if (customer) {
        const newBalance = Math.max(0, Number(customer.credit_balance) - totalRefund);
        await supabaseAdmin.from('customers').update({ credit_balance: newBalance }).eq('id', sale.customer_id);
      }
    }
  }

  // Fetch return details
  const { data: fullReturn, error: fetchError } = await supabaseAdmin
    .from('returns')
    .select(`
      *,
      customer:customers(id, name),
      user:users(id, full_name),
      return_items(
        id, sale_item_id, product_id, batch_id, quantity, condition, refund_amount,
        product:products(id, name, unit)
      )
    `)
    .eq('id', returnRecord.id)
    .single();

  if (fetchError) throw new AppError('Return created but failed to retrieve details', 500);
  res.status(201).json(fullReturn);
};

// List returns
export const listReturns = async (req: Request, res: Response) => {
  const { start_date, end_date, customer_id, page = 1, limit = 50 } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from('returns')
    .select(`
      id, sale_id, customer_id, user_id, return_date, reason, total_refund, refund_method, status,
      customer:customers(id, name),
      user:users(id, full_name)
    `, { count: 'exact' })
    .order('return_date', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (start_date) query = query.gte('return_date', start_date);
  if (end_date) query = query.lte('return_date', end_date);
  if (customer_id) query = query.eq('customer_id', customer_id);

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch returns', 500);
  res.json({ data, total: count || 0, page: pageNum, limit: limitNum, totalPages: Math.ceil((count || 0) / limitNum) });
};

// Get return details
export const getReturn = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('returns')
    .select(`
      *,
      customer:customers(id, name),
      user:users(id, full_name),
      return_items(
        id, sale_item_id, product_id, batch_id, quantity, condition, refund_amount,
        product:products(id, name, unit)
      ),
      sale:sales(id, invoice_no)
    `)
    .eq('id', id)
    .single();

  if (error || !data) throw new AppError('Return not found', 404);
  res.json(data);
};
