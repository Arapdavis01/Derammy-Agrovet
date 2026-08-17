import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

interface StockReductionResult {
  batches: Array<{ batchId: string; quantity: number }>;
  totalQuantity: number;
}

/**
 * Reduce stock for a sale, selecting batches (FEFO if batch tracked)
 * Supports reducing from multiple batches if necessary for batch-tracked products
 */
export async function reduceStock(
  productId: string,
  quantity: number,
  batchId?: string,
  userId?: string,
  referenceId?: string
): Promise<StockReductionResult> {
  if (quantity <= 0) {
    throw new AppError('Quantity must be positive', 400);
  }

  // Fetch product details
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, track_batch_expiry, cost_price')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    throw new AppError('Product not found', 404);
  }

  const reductions: Array<{ batchId: string; quantity: number }> = [];

  if (product.track_batch_expiry) {
    // Batch-tracked product
    if (batchId) {
      // Reduce from specific batch
      const { data: batch, error: batchError } = await supabaseAdmin
        .from('stock_batches')
        .select('id, quantity_remaining')
        .eq('id', batchId)
        .eq('product_id', productId)
        .single();

      if (batchError || !batch) {
        throw new AppError('Invalid batch for product', 400);
      }

      if (Number(batch.quantity_remaining) < quantity) {
        throw new AppError(
          `Insufficient stock in batch. Available: ${batch.quantity_remaining}, Requested: ${quantity}`,
          400
        );
      }

      const newQty = Number(batch.quantity_remaining) - quantity;
      const { error: updateError } = await supabaseAdmin
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', batchId);

      if (updateError) {
        throw new AppError('Failed to reduce stock', 500);
      }

      reductions.push({ batchId, quantity });
    } else {
      // FEFO: Reduce from multiple batches ordered by expiry date
      const { data: batches, error: batchesError } = await supabaseAdmin
        .from('stock_batches')
        .select('id, quantity_remaining, expiry_date')
        .eq('product_id', productId)
        .gt('quantity_remaining', 0)
        .order('expiry_date', { ascending: true, nullsFirst: false });

      if (batchesError || !batches || batches.length === 0) {
        throw new AppError('No stock available for this product', 400);
      }

      const totalAvailable = batches.reduce(
        (sum, b) => sum + Number(b.quantity_remaining),
        0
      );

      if (totalAvailable < quantity) {
        throw new AppError(
          `Insufficient total stock. Available: ${totalAvailable}, Requested: ${quantity}`,
          400
        );
      }

      let remainingToReduce = quantity;
      for (const batch of batches) {
        if (remainingToReduce <= 0) break;

        const availableInBatch = Number(batch.quantity_remaining);
        const reduceFromBatch = Math.min(availableInBatch, remainingToReduce);

        if (reduceFromBatch > 0) {
          const newQty = availableInBatch - reduceFromBatch;
          const { error: updateError } = await supabaseAdmin
            .from('stock_batches')
            .update({ quantity_remaining: newQty })
            .eq('id', batch.id);

          if (updateError) {
            throw new AppError(`Failed to reduce stock from batch ${batch.id}`, 500);
          }

          reductions.push({
            batchId: batch.id,
            quantity: reduceFromBatch,
          });

          remainingToReduce -= reduceFromBatch;
        }
      }

      if (remainingToReduce > 0) {
        throw new AppError('Failed to reduce all required stock', 500);
      }
    }
  } else {
    // Non-batch product: single generic batch
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', productId)
      .is('batch_number', null)
      .is('expiry_date', null)
      .limit(1)
      .single();

    if (batchError || !batch) {
      throw new AppError('No stock available for this product', 400);
    }

    if (Number(batch.quantity_remaining) < quantity) {
      throw new AppError(
        `Insufficient stock. Available: ${batch.quantity_remaining}, Requested: ${quantity}`,
        400
      );
    }

    const newQty = Number(batch.quantity_remaining) - quantity;
    const { error: updateError } = await supabaseAdmin
      .from('stock_batches')
      .update({ quantity_remaining: newQty })
      .eq('id', batch.id);

    if (updateError) {
      throw new AppError('Failed to reduce stock', 500);
    }

    reductions.push({ batchId: batch.id, quantity });
    batchId = batch.id;
  }

  // Record stock movements for each reduction
  for (const reduction of reductions) {
    const { error: movementError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id: productId,
        batch_id: reduction.batchId,
        movement_type: 'sale',
        quantity: -reduction.quantity,
        reference_id: referenceId,
        user_id: userId,
      });

    if (movementError) {
      console.error('Failed to record stock movement:', movementError);
    }
  }

  return {
    batches: reductions,
    totalQuantity: quantity,
  };
}

/**
 * Add stock for a purchase or return
 */
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
  if (quantity <= 0) {
    throw new AppError('Quantity must be positive', 400);
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, track_batch_expiry, cost_price')
    .eq('id', productId)
    .single();

  if (productError || !product) {
    throw new AppError('Product not found', 404);
  }

  let targetBatchId: string;

  if (product.track_batch_expiry) {
    if (batchId) {
      const { data: currentBatch, error: batchQueryError } = await supabaseAdmin
        .from('stock_batches')
        .select('id, quantity_remaining')
        .eq('id', batchId)
        .eq('product_id', productId)
        .single();

      if (batchQueryError || !currentBatch) {
        throw new AppError('Batch not found', 404);
      }

      const newQty = Number(currentBatch.quantity_remaining) + quantity;
      const { error: updateError } = await supabaseAdmin
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', batchId);

      if (updateError) {
        throw new AppError('Failed to update batch', 500);
      }

      targetBatchId = batchId;
    } else {
      if (!batchNumber && !expiryDate) {
        console.warn('Creating batch without batch number or expiry date');
      }

      const { data: newBatch, error: createError } = await supabaseAdmin
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

      if (createError || !newBatch) {
        throw new AppError('Failed to create batch', 500);
      }

      targetBatchId = newBatch.id;
    }
  } else {
    const { data: existingBatch, error: batchQueryError } = await supabaseAdmin
      .from('stock_batches')
      .select('id, quantity_remaining')
      .eq('product_id', productId)
      .is('batch_number', null)
      .is('expiry_date', null)
      .limit(1)
      .single();

    if (existingBatch) {
      const newQty = Number(existingBatch.quantity_remaining) + quantity;
      const { error: updateError } = await supabaseAdmin
        .from('stock_batches')
        .update({ quantity_remaining: newQty })
        .eq('id', existingBatch.id);

      if (updateError) {
        throw new AppError('Failed to update stock', 500);
      }

      targetBatchId = existingBatch.id;
    } else {
      const { data: newBatch, error: createError } = await supabaseAdmin
        .from('stock_batches')
        .insert({
          product_id: productId,
          quantity_remaining: quantity,
          cost_price: costPrice || product.cost_price,
        })
        .select('id')
        .single();

      if (createError || !newBatch) {
        throw new AppError('Failed to create stock batch', 500);
      }

      targetBatchId = newBatch.id;
    }
  }

  const { error: movementError } = await supabaseAdmin
    .from('stock_movements')
    .insert({
      product_id: productId,
      batch_id: targetBatchId,
      movement_type: 'purchase',
      quantity: quantity,
      reference_id: referenceId,
      user_id: userId,
    });

  if (movementError) {
    console.error('Failed to record stock movement:', movementError);
  }

  return { batchId: targetBatchId, quantity };
}

/**
 * Adjust stock for returns, corrections, or other adjustments
 * Positive quantity = add stock, negative quantity = reduce stock
 */
export async function adjustStock(
  productId: string,
  quantity: number,
  batchId?: string,
  movementType: 'return' | 'adjustment' = 'adjustment',
  userId?: string,
  referenceId?: string
): Promise<any> {
  if (quantity === 0) {
    throw new AppError('Quantity cannot be zero', 400);
  }

  if (quantity > 0) {
    const result = await addStock(
      productId,
      quantity,
      batchId,
      undefined,
      undefined,
      undefined,
      userId,
      referenceId
    );

    if (result.batchId) {
      const { data: movements } = await supabaseAdmin
        .from('stock_movements')
        .select('id')
        .eq('reference_id', referenceId)
        .eq('batch_id', result.batchId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (movements && movements.length > 0) {
        await supabaseAdmin
          .from('stock_movements')
          .update({ movement_type: movementType })
          .eq('id', movements[0].id);
      }
    }

    return result;
  } else {
    const reductions = await reduceStock(
      productId,
      Math.abs(quantity),
      batchId,
      userId,
      referenceId
    );

    for (const reduction of reductions.batches) {
      const { data: movements } = await supabaseAdmin
        .from('stock_movements')
        .select('id')
        .eq('reference_id', referenceId)
        .eq('batch_id', reduction.batchId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (movements && movements.length > 0) {
        await supabaseAdmin
          .from('stock_movements')
          .update({ movement_type: movementType })
          .eq('id', movements[0].id);
      }
    }

    return reductions;
  }
}

/**
 * Get available stock quantity for a product
 */
export async function getAvailableStock(productId: string): Promise<number> {
  const { data: batches, error } = await supabaseAdmin
    .from('stock_batches')
    .select('quantity_remaining')
    .eq('product_id', productId)
    .gt('quantity_remaining', 0);

  if (error) {
    throw new AppError('Failed to fetch stock', 500);
  }

  const totalStock = batches.reduce(
    (sum, batch) => sum + Number(batch.quantity_remaining),
    0
  );

  return totalStock;
}

/**
 * Check if stock is available for a product
 */
export async function checkStockAvailability(
  productId: string,
  quantity: number
): Promise<{ available: boolean; availableQuantity: number }> {
  const availableQuantity = await getAvailableStock(productId);
  return {
    available: availableQuantity >= quantity,
    availableQuantity,
  };
}
