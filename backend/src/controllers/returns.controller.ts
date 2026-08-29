import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';
import { addStock, reduceStock } from '../services/stock.service';

// Generate return receipt number: RET-YYYYMMDD-XXXX
const generateReturnReceiptNo = async (): Promise<string> => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const { count, error } = await supabaseAdmin
    .from('returns')
    .select('id', { count: 'exact', head: true })
    .gte('return_date', `${dateStr}T00:00:00Z`)
    .lt('return_date', `${dateStr}T23:59:59Z`);

  if (error) throw new AppError('Failed to generate return receipt number', 500);
  const sequence = String((count || 0) + 1).padStart(4, '0');
  return `RET-${dateStr}-${sequence}`;
};

// Create a return or exchange for a sale
export const createReturn = async (req: Request, res: Response) => {
  const {
    sale_id,
    items, // [{ sale_item_id, quantity, reason, condition }]
    return_type = 'return', // 'return' | 'exchange'
    exchange_product_id,
    exchange_quantity = 1,
    refund_method = 'cash',
    cashier_id, // New: cashier processing the return
    reason, // New: optional reason
  } = req.body;

  const userId = (req as any).user.id;
  const userRole = (req as any).user.role;

  console.log('Creating return with data:', {
    sale_id,
    items,
    return_type,
    exchange_product_id,
    exchange_quantity,
    refund_method,
    cashier_id,
    reason,
  });

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

  // Check if sale is already fully returned
  if (sale.return_status === 'full') {
    throw new AppError('This sale has been fully returned', 400);
  }

  // Check return window (5 working days)
  const saleDate = new Date(sale.sale_date);
  const now = new Date();
  const daysDifference = Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDifference > 5 && userRole !== 'admin' && userRole !== 'manager') {
    throw new AppError('Return window expired (5 working days). Manager approval required.', 403);
  }

  // Fetch sale items
  const { data: saleItems, error: itemsError } = await supabaseAdmin
    .from('sale_items')
    .select('*, product:products(*)')
    .eq('sale_id', sale_id);

  if (itemsError) throw new AppError('Failed to fetch sale items', 500);

  // Validate requested items, check return status, and calculate refund total
  let totalRefund = 0;
  const returnItemsData = [];

  for (const returnItem of items) {
    const saleItem = saleItems.find((si: any) => si.id === returnItem.sale_item_id);
    if (!saleItem) throw new AppError(`Sale item not found: ${returnItem.sale_item_id}`, 404);

    // Check if item is already returned or exchanged
    if (saleItem.return_status === 'returned') {
      throw new AppError(`Item "${saleItem.product?.name || 'Product'}" has already been returned`, 400);
    }
    if (saleItem.return_status === 'exchanged') {
      throw new AppError(`Item "${saleItem.product?.name || 'Product'}" has already been exchanged`, 400);
    }

    // Check if product is returnable
    if (saleItem.product && saleItem.product.is_returnable === false) {
      throw new AppError(`Product "${saleItem.product.name}" is non-returnable`, 400);
    }

    if (returnItem.quantity <= 0 || returnItem.quantity > saleItem.quantity) {
      throw new AppError(`Invalid quantity for item ${saleItem.product?.name || saleItem.product_id}`, 400);
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
      unit_price: saleItem.unit_price,
    });
  }

  // Large return approval check (threshold: KES 10,000)
  const LARGE_RETURN_THRESHOLD = 10000;
  if (totalRefund > LARGE_RETURN_THRESHOLD && userRole !== 'admin' && userRole !== 'manager') {
    throw new AppError('Large return requires supervisor/manager approval', 403);
  }

  // Handle exchange product and price difference
  let exchangeProduct = null;
  let exchangeTotal = 0;
  let priceDifference = 0;

  if (return_type === 'exchange') {
    if (!exchange_product_id) throw new AppError('Exchange product is required', 400);
    
    const { data: exchangeProductData, error: exchangeProductError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', exchange_product_id)
      .single();
      
    if (exchangeProductError || !exchangeProductData) throw new AppError('Exchange product not found', 404);
    
    exchangeProduct = exchangeProductData;
    exchangeTotal = Number(exchangeProductData.selling_price) * Number(exchange_quantity || 1);
    priceDifference = exchangeTotal - totalRefund;
  }

  // Generate return receipt number
  const return_receipt_no = await generateReturnReceiptNo();

  // Insert return record
  const { data: returnRecord, error: returnError } = await supabaseAdmin
    .from('returns')
    .insert({
      sale_id,
      return_receipt_no,
      customer_id: sale.customer_id,
      user_id: userId,
      cashier_id: cashier_id || null,
      reason: reason || req.body.reason || '',
      total_refund: totalRefund,
      refund_method,
      status: 'completed',
      return_type,
      exchange_product_id: exchange_product_id || null,
      exchange_quantity: exchange_product_id ? (exchange_quantity || 1) : null,
      exchange_amount: exchangeTotal || null,
      price_difference: priceDifference || 0,
      return_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (returnError) {
    console.error('Failed to create return:', returnError);
    throw new AppError('Failed to create return', 500);
  }

  // Process returned items
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
        reason: item.reason || null,
        unit_price: item.unit_price,
      });

    if (insertItemError) {
      console.error('Failed to insert return item:', insertItemError);
      await supabaseAdmin.from('returns').delete().eq('id', returnRecord.id);
      throw new AppError('Failed to insert return item', 500);
    }

    // Update sale item return status
    const { error: updateItemError } = await supabaseAdmin
      .from('sale_items')
      .update({ 
        return_status: return_type === 'exchange' ? 'exchanged' : 'returned',
        returned_quantity: item.quantity,
      })
      .eq('id', item.sale_item_id);

    if (updateItemError) {
      console.error('Failed to update sale item return status:', updateItemError);
      // Continue processing - don't fail the whole return
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
        console.error('Failed to restock item:', e);
        // Rollback return
        await supabaseAdmin.from('returns').delete().eq('id', returnRecord.id);
        await supabaseAdmin.from('return_items').delete().eq('return_id', returnRecord.id);
        throw e;
      }
    }
  }

  // If exchange, reduce stock of exchange product
  if (return_type === 'exchange' && exchangeProduct) {
    try {
      await reduceStock(
        exchangeProduct.id,
        exchange_quantity || 1,
        undefined,
        userId,
        returnRecord.id
      );
    } catch (e: any) {
      console.error('Failed to reduce exchange product stock:', e);
      // Rollback return
      await supabaseAdmin.from('returns').delete().eq('id', returnRecord.id);
      await supabaseAdmin.from('return_items').delete().eq('return_id', returnRecord.id);
      throw e;
    }
  }

  // Update sale return status
  const { data: updatedSaleItems } = await supabaseAdmin
    .from('sale_items')
    .select('return_status')
    .eq('sale_id', sale_id);

  if (updatedSaleItems) {
    const totalItems = updatedSaleItems.length;
    const returnedItems = updatedSaleItems.filter(
      (item: any) => item.return_status === 'returned' || item.return_status === 'exchanged'
    ).length;

    let saleReturnStatus = 'none';
    if (returnedItems === totalItems) {
      saleReturnStatus = 'full';
    } else if (returnedItems > 0) {
      saleReturnStatus = 'partial';
    }

    const { error: updateSaleError } = await supabaseAdmin
      .from('sales')
      .update({ return_status: saleReturnStatus })
      .eq('id', sale_id);

    if (updateSaleError) {
      console.error('Failed to update sale return status:', updateSaleError);
    }
  }

  // If credit sale or had credit component, adjust customer balance if credit note
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

  // Fetch complete return details
  const { data: fullReturn, error: fetchError } = await supabaseAdmin
    .from('returns')
    .select(`
      *,
      customer:customers(id, name),
      user:users(id, full_name),
      cashier:cashiers(id, full_name),
      sale:sales(id, invoice_no),
      return_items(
        id, sale_item_id, product_id, batch_id, quantity, condition, refund_amount, reason, unit_price,
        product:products(id, name, unit),
        sale_item:sale_items(id, quantity, unit_price)
      ),
      exchange_product:products!returns_exchange_product_id_fkey(id, name, unit, selling_price)
    `)
    .eq('id', returnRecord.id)
    .single();

  if (fetchError) {
    console.error('Failed to fetch return details:', fetchError);
    // Return the record we have
    res.status(201).json(returnRecord);
    return;
  }

  console.log('Return created successfully:', fullReturn);
  res.status(201).json(fullReturn);
};

// List returns
export const listReturns = async (req: Request, res: Response) => {
  const { 
    start_date, 
    end_date, 
    customer_id,
    user_id,
    sale_id,
    return_type,
    refund_method,
    page = 1, 
    limit = 50 
  } = req.query as any;
  
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from('returns')
    .select(`
      id, sale_id, return_receipt_no, customer_id, user_id, cashier_id, return_date, reason, 
      total_refund, refund_method, status, return_type,
      exchange_product_id, exchange_quantity, exchange_amount, price_difference,
      customer:customers(id, name),
      user:users(id, full_name),
      cashier:cashiers(id, full_name),
      sale:sales(id, invoice_no)
    `, { count: 'exact' })
    .order('return_date', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (start_date) query = query.gte('return_date', start_date);
  if (end_date) query = query.lte('return_date', end_date);
  if (customer_id) query = query.eq('customer_id', customer_id);
  if (user_id) query = query.eq('user_id', user_id);
  if (sale_id) query = query.eq('sale_id', sale_id);
  if (return_type) query = query.eq('return_type', return_type);
  if (refund_method) query = query.eq('refund_method', refund_method);

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to fetch returns:', error);
    throw new AppError('Failed to fetch returns', 500);
  }
  
  res.json({ 
    data: data || [], 
    total: count || 0, 
    page: pageNum, 
    limit: limitNum, 
    totalPages: Math.ceil((count || 0) / limitNum) 
  });
};

// Get return details
export const getReturn = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const { data, error } = await supabaseAdmin
    .from('returns')
    .select(`
      *,
      customer:customers(id, name, phone),
      user:users(id, full_name),
      cashier:cashiers(id, full_name),
      sale:sales(id, invoice_no, sale_date),
      return_items(
        id, sale_item_id, product_id, batch_id, quantity, condition, refund_amount, reason, unit_price,
        product:products(id, name, unit),
        sale_item:sale_items(id, quantity, unit_price)
      ),
      exchange_product:products!returns_exchange_product_id_fkey(id, name, unit, selling_price)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Return not found:', error);
    throw new AppError('Return not found', 404);
  }
  
  res.json(data);
};
