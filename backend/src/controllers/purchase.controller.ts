import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';
import { addStock } from '../services/stock.service';

// Generate PO number: PO-XXXXXXXX (8 chars)
const generatePONumber = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PO-${result}`;
};

// Create a purchase order (pending by default)
export const createPurchase = async (req: Request, res: Response) => {
  const {
    supplier_id,
    items,
    status = 'pending',
    requested_by,
  } = req.body as any;

  const userId = (req as any).user.id;

  if (!supplier_id) throw new AppError('Supplier is required', 400);
  if (!items || items.length === 0) throw new AppError('No items provided', 400);
  if (!requested_by) throw new AppError('Requested by is required', 400);

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

  // Generate PO number (ensuring uniqueness)
  let po_number = generatePONumber();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('po_number', po_number)
      .single();
    if (!existing) break;
    po_number = generatePONumber();
    attempts++;
  }

  // Insert purchase record as pending
  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from('purchases')
    .insert({
      po_number,
      supplier_id,
      total,
      status,
      user_id: userId,
      requested_by,
    })
    .select()
    .single();

  if (purchaseError) throw new AppError('Failed to create purchase', 500);

  // Insert purchase items (no stock update yet)
  for (const item of purchaseItemsData) {
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
      await supabaseAdmin.from('purchases').delete().eq('id', purchase.id);
      throw new AppError('Failed to insert purchase item', 500);
    }
  }

  // Fetch complete purchase
  const { data: fullPurchase, error: fetchError } = await supabaseAdmin
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(id, name),
      user:users(id, full_name),
      requested_by_user:users!purchases_requested_by_fkey(id, full_name),
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
      id, po_number, supplier_id, purchase_date, total, status, user_id,
      requested_by, received_by,
      supplier:suppliers(id, name),
      user:users(id, full_name),
      requested_by_user:users!purchases_requested_by_fkey(id, full_name),
      received_by_user:users!purchases_received_by_fkey(id, full_name)
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
      requested_by_user:users!purchases_requested_by_fkey(id, full_name),
      received_by_user:users!purchases_received_by_fkey(id, full_name),
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

// Receive purchase (update stock and status)
export const receivePurchase = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { received_by } = req.body;
  const userId = (req as any).user.id;

  if (!received_by) throw new AppError('Received by is required', 400);

  // Fetch purchase
  const { data: purchase, error: fetchError } = await supabaseAdmin
    .from('purchases')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !purchase) throw new AppError('Purchase not found', 404);
  if (purchase.status === 'received') throw new AppError('Purchase already received', 400);

  // Fetch purchase items
  const { data: items } = await supabaseAdmin
    .from('purchase_items')
    .select('*')
    .eq('purchase_id', id);

  if (!items || items.length === 0) throw new AppError('No items found for this purchase', 400);

  // Add stock for each item
  for (const item of items) {
    try {
      await addStock(
        item.product_id,
        item.quantity,
        undefined,
        undefined,
        undefined,
        item.cost_price,
        userId,
        id
      );
    } catch (e: any) {
      throw new AppError(`Failed to add stock for product ${item.product_id}`, 500);
    }
  }

  // Update purchase status and received_by
  const { error: updateError } = await supabaseAdmin
    .from('purchases')
    .update({ status: 'received', received_by: received_by || userId })
    .eq('id', id);

  if (updateError) throw new AppError('Failed to update purchase status', 500);

  res.json({ message: 'Purchase received successfully', purchase_id: id });
};
