import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Reduce stock for a sale, selecting batches (FEFO if batch tracked)
export async function reduceStock(
  productId: string,
  quantity: number,
  batchId?: string,
  userId?: string,
  referenceId?: string
): Promise<{ batchId: string; quantity: number }> {
  // If batchId provided, use it; otherwise handle based on product's track_batch_expiry
  const { data: product } = await supabase
    .from('products')
    .select('track_batch_expiry, unit')
    .eq('id', productId)
    .single();

  if (!product) throw new AppError('Product not found', 404);

  if (product.track_batch_expiry) {
    // Must have batchId or select earliest expiry (FEFO)
    if (!batchId) {
      // Get batches with quantity > 0 ordered by expiry date
      const { data: batches, error } = await supabase
        .from('stock_batches')
        .select('id, quantity_remaining')
        .eq('product_id', productId)
        .gt('quantity_remaining', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .limit(1);

      if (error || !batches || batches.length === 0) {
        throw new AppError('No stock available for this product', 400);
      }
      batchId = batches[0].id;
    } else {
      // Validate batch belongs to product
      const { data: batch } = await supabase
        .from('stock_batches')
        .select('id')
        .eq('id', batchId)
        .eq('product_id', productId)
        .single();
      if (!batch) throw new AppError('Invalid batch for product', 400);
    }

    // Reduce quantity in batch
    const { data: currentBatch } = await supabase
      .from('stock_batches')
      .select('quantity_remaining')
      .eq('id', batchId)
      .single();

    if (!currentBatch) throw new AppError('Batch not found', 404);
    if (Number(currentBatch.quantity_remaining) < quantity) {
      throw new AppError('Insufficient stock in selected batch', 400);
    }

    const newQty = Number(currentBatch.quantity_remaining) - quantity;
    const { error: updateError } = await supabase
      .from('stock_batches')
      .update({ quantity_remaining: newQty })
      .eq('id', batchId);
    if (updateError) throw new AppError('Failed to reduce stock', 500);
  } else {
    // Non-batch product: single generic batch
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', productId)
      .is('batch_number', null)
      .is('expiry_date', null)
      .single();

    if (!batch) throw new AppError('No stock available', 400);
    if (Number(batch.quantity_remaining) < quantity) {
      throw new AppError('Insufficient stock', 400);
    }

    const newQty = Number(batch.quantity_remaining) - quantity;
    const { error } = await supabase
      .from('stock_batches')
      .update({ quantity_remaining: newQty })
      .eq('id', batch.id);
    if (error) throw new AppError('Failed to reduce stock', 500);
    batchId = batch.id;
  }

  // Record movement
  await supabase.from('stock_movements').insert({
    product_id: productId,
    batch_id: batchId,
    movement_type: 'sale',
    quantity: -quantity,
    reference_id: referenceId,
    user_id: userId,
  });

  return { batchId, quantity };
}

// Increase stock for a purchase
export async function addStock(
  productId: string,
  quantity: number,
  batchId?: string,
  batchNumber?: string,
  expiryDate?: string,
  costPrice?: number,
  userId?: string,
  referenceId?: string
): Promise<{ batchId: string; quantity: number }> {
  const { data: product } = await supabase
    .from('products')
    .select('track_batch_expiry, unit')
    .eq('id', productId)
    .single();

  if (!product) throw new AppError('Product not found', 404);

  if (product.track_batch_expiry) {
    // If batchId provided, update it; else create new batch
    if (batchId) {
      const { data: currentBatch } = await supabase
        .from('stock_batches')
        .select('quantity_remaining')
        .eq('id', batchId)
        .single();
      if (!currentBatch) throw new AppError('Batch not found', 404);
      const newQty = Number(currentBatch.quantity_remaining) + quantity;
      const { error } = await supabase
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', batchId);
      if (error) throw new AppError('Failed to update batch', 500);
    } else {
      // Create new batch
      const { data: newBatch, error } = await supabase
        .from('stock_batches')
        .insert({
          product_id: productId,
          batch_number: batchNumber,
          expiry_date: expiryDate,
          quantity_remaining: quantity,
          cost_price: costPrice || product.cost_price,
        })
        .select('id')
        .single();
      if (error || !newBatch) throw new AppError('Failed to create batch', 500);
      batchId = newBatch.id;
    }
  } else {
    // Non-batch: use generic batch
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', productId)
      .is('batch_number', null)
      .is('expiry_date', null)
      .single();

    if (batch) {
      const newQty = Number(batch.quantity_remaining) + quantity;
      const { error } = await supabase
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', batch.id);
      if (error) throw new AppError('Failed to update stock', 500);
      batchId = batch.id;
    } else {
      const { data: newBatch, error } = await supabase
        .from('stock_batches')
        .insert({
          product_id: productId,
          quantity_remaining: quantity,
          cost_price: costPrice || product.cost_price,
        })
        .select('id')
        .single();
      if (error || !newBatch) throw new AppError('Failed to create stock batch', 500);
      batchId = newBatch.id;
    }
  }

  // Record movement
  await supabase.from('stock_movements').insert({
    product_id: productId,
    batch_id: batchId,
    movement_type: 'purchase',
    quantity: quantity,
    reference_id: referenceId,
    user_id: userId,
  });

  return { batchId, quantity };
}

// Adjust stock (for returns, adjustments)
export async function adjustStock(
  productId: string,
  quantity: number,
  batchId?: string,
  movementType: 'return' | 'adjustment' = 'adjustment',
  userId?: string,
  referenceId?: string
) {
  // Similar to reduce/add but can handle both positive and negative
  // Use existing reduceStock or addStock depending on quantity sign
  if (quantity < 0) {
    return reduceStock(productId, Math.abs(quantity), batchId, userId, referenceId);
  } else {
    return addStock(productId, quantity, batchId, undefined, undefined, undefined, userId, referenceId);
  }
}
