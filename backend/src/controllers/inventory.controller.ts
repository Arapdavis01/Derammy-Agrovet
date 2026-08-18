import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Get current stock levels for all products
export const getStockLevels = async (req: Request, res: Response) => {
  const { data: products, error } = await supabaseAdmin
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

  const stockLevels = products.map((product: any) => {
    const totalStock = product.stock_batches.reduce(
      (sum: number, batch: any) => sum + Number(batch.quantity_remaining),
      0
    );
    return {
      ...product,
      total_stock: totalStock,
      is_low_stock: totalStock <= Number(product.reorder_level),
    };
  });

  res.json(stockLevels);
};

// Get low stock products
export const getLowStock = async (req: Request, res: Response) => {
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select(`
      id,
      name,
      sku,
      unit,
      category:categories(id, name),
      reorder_level,
      stock_batches(id, batch_number, expiry_date, quantity_remaining)
    `)
    .order('name');

  if (error) throw new AppError('Failed to fetch products', 500);

  const lowStock = products
    .map((p: any) => {
      const totalStock = p.stock_batches.reduce(
        (sum: number, b: any) => sum + Number(b.quantity_remaining),
        0
      );
      return { ...p, total_stock: totalStock };
    })
    .filter((p: any) => p.total_stock <= Number(p.reorder_level));

  res.json(lowStock);
};

// Get expiring soon products
export const getExpiringSoon = async (req: Request, res: Response) => {
  const { days = '30' } = req.query;
  const daysNum = parseInt(days as string) || 30;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + daysNum);
  futureDate.setHours(23, 59, 59, 999);

  const { data, error } = await supabaseAdmin
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
    .gte('expiry_date', today.toISOString().split('T')[0])
    .lte('expiry_date', futureDate.toISOString().split('T')[0])
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true });

  if (error) throw new AppError('Failed to fetch expiring batches', 500);
  res.json(data);
};

// Manual stock adjustment
export const adjustStock = async (req: Request, res: Response) => {
  const { product_id, quantity, reason, batch_id } = req.body;
  const userId = (req as any).user.id;

  if (!product_id || quantity === undefined || quantity === null || Number(quantity) === 0) {
    throw new AppError('Product and non-zero quantity are required', 400);
  }

  if (!reason || !reason.trim()) {
    throw new AppError('Reason for adjustment is required', 400);
  }

  const adjustmentQty = Number(quantity);

  const { data: product, error: prodError } = await supabaseAdmin
    .from('products')
    .select('id, name, unit, track_batch_expiry, cost_price')
    .eq('id', product_id)
    .single();

  if (prodError || !product) throw new AppError('Product not found', 404);

  let targetBatchId = batch_id || null;

  if (product.track_batch_expiry) {
    if (targetBatchId) {
      // Adjust specific batch
      const { data: batch, error: batchError } = await supabaseAdmin
        .from('stock_batches')
        .select('id, product_id, quantity_remaining')
        .eq('id', targetBatchId)
        .single();

      if (batchError || !batch) throw new AppError('Batch not found', 404);
      if (batch.product_id !== product_id) throw new AppError('Invalid batch for this product', 400);

      const newQty = Number(batch.quantity_remaining) + adjustmentQty;
      if (newQty < 0) throw new AppError('Insufficient stock in batch', 400);

      const { error: updateError } = await supabaseAdmin
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', targetBatchId);

      if (updateError) throw new AppError('Failed to update batch stock', 500);
    } else {
      // No batch_id provided
      if (adjustmentQty < 0) {
        throw new AppError('Cannot reduce stock: batch is required for this product', 400);
      }

      // Positive adjustment: create a new batch (like purchase)
      const { data: newBatch, error: createError } = await supabaseAdmin
        .from('stock_batches')
        .insert({
          product_id,
          quantity_remaining: adjustmentQty,
          cost_price: product.cost_price || 0,
        })
        .select()
        .single();

      if (createError) throw new AppError('Failed to create stock batch', 500);
      targetBatchId = newBatch.id;
    }
  } else {
    // Non-batch product: use default batch or create one
    const { data: existingBatch, error: batchQueryError } = await supabaseAdmin
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', product_id)
      .is('batch_number', null)
      .is('expiry_date', null)
      .limit(1)
      .single();

    if (existingBatch) {
      const newQty = Number(existingBatch.quantity_remaining) + adjustmentQty;
      if (newQty < 0) throw new AppError('Insufficient stock in batch', 400);

      const { error: updateError } = await supabaseAdmin
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', existingBatch.id);

      if (updateError) throw new AppError('Failed to update stock', 500);
      targetBatchId = existingBatch.id;
    } else {
      if (adjustmentQty < 0) {
        throw new AppError('Cannot reduce stock: no stock available for this product', 400);
      }

      const { data: newBatch, error: createError } = await supabaseAdmin
        .from('stock_batches')
        .insert({
          product_id,
          quantity_remaining: adjustmentQty,
          cost_price: product.cost_price || 0,
        })
        .select()
        .single();

      if (createError) throw new AppError('Failed to create stock batch', 500);
      targetBatchId = newBatch.id;
    }
  }

  // Record stock movement
  const { error: movementError } = await supabaseAdmin
    .from('stock_movements')
    .insert({
      product_id,
      batch_id: targetBatchId,
      movement_type: 'adjustment',
      quantity: adjustmentQty,
      reference_id: null,
      user_id: userId,
    });

  if (movementError) {
    // Rollback the stock update
    if (targetBatchId) {
      const { data: currentBatch } = await supabaseAdmin
        .from('stock_batches')
        .select('quantity_remaining')
        .eq('id', targetBatchId)
        .single();

      if (currentBatch) {
        const rollbackQty = Number(currentBatch.quantity_remaining) - adjustmentQty;
        await supabaseAdmin
          .from('stock_batches')
          .update({ quantity_remaining: rollbackQty })
          .eq('id', targetBatchId);
      }
    }
    throw new AppError('Failed to record stock movement', 500);
  }

  res.json({
    message: 'Stock adjusted successfully',
    product_id,
    batch_id: targetBatchId,
    adjustment: adjustmentQty,
  });
};

// Get stock movements history with filters and pagination
export const getStockMovements = async (req: Request, res: Response) => {
  const {
    product_id,
    type,
    start_date,
    end_date,
    limit = '50',
    page = '1',
  } = req.query as any;

  const limitNum = parseInt(limit) || 50;
  const pageNum = parseInt(page) || 1;
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
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
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limitNum - 1);

  if (product_id) query = query.eq('product_id', product_id);
  if (type) query = query.eq('movement_type', type);
  if (start_date) query = query.gte('created_at', start_date);
  if (end_date) query = query.lte('created_at', end_date);

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch stock movements', 500);

  res.json({
    data,
    total: count || 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((count || 0) / limitNum),
  });
};

// Get available batches for a product (for POS batch selection)
export const getProductBatches = async (req: Request, res: Response) => {
  const { productId } = req.params;

  const { data, error } = await supabaseAdmin
    .from('stock_batches')
    .select('id, batch_number, expiry_date, quantity_remaining')
    .eq('product_id', productId)
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false });

  if (error) throw new AppError('Failed to fetch batches', 500);
  res.json(data);
};
