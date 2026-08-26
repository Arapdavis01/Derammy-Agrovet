import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';
import { addStock } from '../services/stock.service';

// Create a purchase (goods received)
export const createPurchase = async (req: Request, res: Response) => {
  const {
    supplier_id,
    items, // [{ product_id, quantity, cost_price?, batch_number?, expiry_date? }]
    status = 'received',
  } = req.body;

  const userId = (req as any).user.id;

  if (!supplier_id) throw new AppError('Supplier is required', 400);
  if (!items || items.length === 0) throw new AppError('No items provided', 400);

  let total = 0;
  const purchaseItemsData = [];

  // Validate items and compute totals
  for (const item of items) {
    const { product_id, quantity, cost_price, batch_number, expiry_date } = item;
    if (!product_id || !quantity || quantity <= 0) {
      throw new AppError('Invalid item data', 400);
    }

    let price = cost_price;
    if (!price) {
      // Fetch product cost price
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('cost_price')
        .eq('id', product_id)
        .single();
      if (!product) throw new AppError(`Product not found: ${product_id}`, 404);
      price = product.cost_price;
    }

    const lineTotal = Number(quantity) * Number(price);
    total += lineTotal;

    purchaseItemsData.push({
      product_id,
      quantity,
      cost_price: price,
      batch_number,
      expiry_date,
    });
  }

  // Insert purchase record
  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from('purchases')
    .insert({
      supplier_id,
      total,
      status,
      user_id: userId,
    })
    .select()
    .single();

  if (purchaseError) throw new AppError('Failed to create purchase', 500);

  // Process each item: insert purchase item and add stock
  for (const item of purchaseItemsData) {
    // Insert purchase item
    const { error: itemError } = await supabaseAdmin
      .from('purchase_items')
      .insert({
        purchase_id: purchase.id,
        product_id: item.product_id,
        quantity: item.quantity,
        cost_price: item.cost_price,
        total: item.quantity * item.cost_price,
      });

    if (itemError) {
      // Rollback purchase
      await supabaseAdmin.from('purchases').delete().eq('id', purchase.id);
      throw new AppError('Failed to insert purchase item', 500);
    }

    // Add stock
    try {
      await addStock(
        item.product_id,
        item.quantity,
        undefined, // batchId (will create new)
        item.batch_number,
        item.expiry_date,
        item.cost_price,
        userId,
        purchase.id
      );
    } catch (e: any) {
      await supabaseAdmin.from('purchases').delete().eq('id', purchase.id);
      throw e;
    }
  }

  // Fetch complete purchase with user name
  const { data: fullPurchase, error: fetchError } = await supabaseAdmin
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(id, name),
      user:users(id, full_name),
      purchase_items(
        id, product_id, batch_id, quantity, cost_price, total,
        product:products(id, name, unit)
      )
    `)
    .eq('id', purchase.id)
    .single();

  if (fetchError) throw new AppError('Purchase created but failed to retrieve details', 500);
  res.status(201).json(fullPurchase);
};

// List purchases
export const listPurchases = async (req: Request, res: Response) => {
  const { start_date, end_date, supplier_id, page = 1, limit = 50 } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from('purchases')
    .select(`
      id, supplier_id, purchase_date, total, status, user_id,
      supplier:suppliers(id, name),
      user:users(id, full_name)
    `, { count: 'exact' })
    .order('purchase_date', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (start_date) query = query.gte('purchase_date', start_date);
  if (end_date) query = query.lte('purchase_date', end_date);
  if (supplier_id) query = query.eq('supplier_id', supplier_id);

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch purchases', 500);
  res.json({
    data,
    total: count || 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((count || 0) / limitNum),
  });
};

// Get purchase details
export const getPurchase = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(id, name),
      user:users(id, full_name),
      purchase_items(
        id, product_id, batch_id, quantity, cost_price, total,
        product:products(id, name, unit)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) throw new AppError('Purchase not found', 404);
  res.json(data);
};
