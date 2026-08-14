import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Get current stock levels for all products
export const getStockLevels = async (req: Request, res: Response) => {
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      sku,
      unit,
      category:categories(id, name),
      reorder_level,
      track_batch_expiry,
      stock_batches(id, batch_number, expiry_date, quantity_remaining)
    `)
    .order('name');

  if (error) throw new AppError('Failed to fetch stock levels', 500);

  // Calculate total stock per product
  const stockLevels = products.map((product: any) => {
    const totalStock = product.stock_batches.reduce((sum: number, batch: any) => sum + Number(batch.quantity_remaining), 0);
    return {
      ...product,
      total_stock: totalStock,
      is_low_stock: totalStock <= product.reorder_level,
    };
  });

  res.json(stockLevels);
};

// Get low stock products
export const getLowStock = async (req: Request, res: Response) => {
  // We need products where total stock <= reorder_level, using aggregate sum.
  // Since supabase-js doesn't easily do having clause on aggregate, we can fetch all and filter in JS.
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      sku,
      unit,
      reorder_level,
      stock_batches(id, batch_number, expiry_date, quantity_remaining)
    `);

  if (error) throw new AppError('Failed to fetch products', 500);

  const lowStock = products
    .map((p: any) => {
      const totalStock = p.stock_batches.reduce((sum: number, b: any) => sum + Number(b.quantity_remaining), 0);
      return { ...p, total_stock: totalStock };
    })
    .filter((p: any) => p.total_stock <= p.reorder_level);

  res.json(lowStock);
};

// Get expiring soon products (within 30 days by default)
export const getExpiringSoon = async (req: Request, res: Response) => {
  const { days = 30 } = req.query;
  const daysNum = parseInt(days as string) || 30;
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + daysNum);

  const { data, error } = await supabase
    .from('stock_batches')
    .select(`
      id,
      product_id,
      batch_number,
      expiry_date,
      quantity_remaining,
      product:products(id, name, unit)
    `)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', futureDate.toISOString())
    .gte('expiry_date', today.toISOString())
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true });

  if (error) throw new AppError('Failed to fetch expiring batches', 500);
  res.json(data);
};

// Manual stock adjustment
export const adjustStock = async (req: Request, res: Response) => {
  const { product_id, quantity, reason, batch_id } = req.body;
  const userId = (req as any).user.id;

  if (!product_id || quantity === undefined || quantity === 0) {
    throw new AppError('Product and non-zero quantity are required', 400);
  }

  // If product tracks batch/expiry and no batch_id, require batch
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('track_batch_expiry, unit')
    .eq('id', product_id)
    .single();

  if (prodError || !product) throw new AppError('Product not found', 404);

  if (product.track_batch_expiry && !batch_id) {
    throw new AppError('Batch is required for this product', 400);
  }

  // If batch_id provided, ensure it belongs to product
  if (batch_id) {
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('product_id')
      .eq('id', batch_id)
      .single();
    if (!batch || batch.product_id !== product_id) {
      throw new AppError('Invalid batch for this product', 400);
    }
  }

  // Start transaction: update stock_batches quantity, insert stock_movement
  // Use supabaseAdmin for transaction-like operation? supabase-js doesn't have transactions, so we do multiple queries with careful error handling.
  // For simplicity, we'll do sequential operations.

  if (batch_id) {
    // Update specific batch
    const { data: currentBatch } = await supabase
      .from('stock_batches')
      .select('quantity_remaining')
      .eq('id', batch_id)
      .single();

    if (!currentBatch) throw new AppError('Batch not found', 404);

    const newQty = Number(currentBatch.quantity_remaining) + Number(quantity);
    if (newQty < 0) throw new AppError('Insufficient stock in batch', 400);

    const { error: updateError } = await supabase
      .from('stock_batches')
      .update({ quantity_remaining: newQty })
      .eq('id', batch_id);

    if (updateError) throw new AppError('Failed to update batch stock', 500);
  } else {
    // For non-batch products, we need to adjust a single stock batch (create if not exists)
    const { data: existingBatch } = await supabase
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', product_id)
      .is('batch_number', null)
      .is('expiry_date', null)
      .single();

    if (existingBatch) {
      const newQty = Number(existingBatch.quantity_remaining) + Number(quantity);
      if (newQty < 0) throw new AppError('Insufficient stock', 400);
      const { error } = await supabase
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', existingBatch.id);
      if (error) throw new AppError('Failed to update stock', 500);
    } else {
      // Create a new batch with the quantity
      const { error } = await supabase
        .from('stock_batches')
        .insert({
          product_id,
          quantity_remaining: quantity,
          cost_price: product.cost_price,
        });
      if (error) throw new AppError('Failed to create stock batch', 500);
    }
  }

  // Insert stock movement
  const movementType = quantity > 0 ? 'adjustment_in' : 'adjustment_out';
  // Since enum only allows 'purchase','sale','return','adjustment', we'll use 'adjustment' for both.
  const { error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      product_id,
      batch_id,
      movement_type: 'adjustment',
      quantity: quantity, // positive for in, negative for out
      reference_id: null,
      user_id: userId,
    });

  if (movementError) throw new AppError('Failed to record stock movement', 500);

  res.json({ message: 'Stock adjusted successfully' });
};

// Get stock movements history with filters
export const getStockMovements = async (req: Request, res: Response) => {
  const { product_id, type, start_date, end_date, limit = 50, page = 1 } = req.query as any;

  const limitNum = parseInt(limit);
  const pageNum = parseInt(page);
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('stock_movements')
    .select(`
      id,
      product_id,
      batch_id,
      movement_type,
      quantity,
      reference_id,
      user_id,
      created_at,
      product:products(id, name, unit),
      user:users(id, full_name)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (product_id) query = query.eq('product_id', product_id);
  if (type) query = query.eq('movement_type', type);
  if (start_date) query = query.gte('created_at', start_date);
  if (end_date) query = query.lte('created_at', end_date);

  const { data, error } = await query;

  if (error) throw new AppError('Failed to fetch stock movements', 500);
  res.json(data);
};

// Get batches for a product (useful for POS selection)
export const getProductBatches = async (req: Request, res: Response) => {
  const { productId } = req.params;

  const { data, error } = await supabase
    .from('stock_batches')
    .select('id, batch_number, expiry_date, quantity_remaining')
    .eq('product_id', productId)
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false });

  if (error) throw new AppError('Failed to fetch batches', 500);
  res.json(data);
};
