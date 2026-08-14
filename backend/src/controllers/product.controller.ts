import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List products with search, category filter, and pagination
export const listProducts = async (req: Request, res: Response) => {
  const {
    search,
    category_id,
    page = '1',
    limit = '20',
    include_inactive = 'false',
  } = req.query as any;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name)
    `, { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limitNum - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
  }

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (include_inactive !== 'true') {
    // Assuming no 'active' field in products; we can ignore for now
  }

  const { data, error, count } = await query;

  if (error) throw new AppError('Failed to fetch products', 500);

  res.json({
    data,
    total: count || 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((count || 0) / limitNum),
  });
};

// Get a single product by ID
export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      category:categories(id, name)
    `)
    .eq('id', id)
    .single();

  if (error || !data) throw new AppError('Product not found', 404);
  res.json(data);
};

// Create new product
export const createProduct = async (req: Request, res: Response) => {
  const {
    name,
    sku,
    barcode,
    category_id,
    unit,
    cost_price,
    selling_price,
    reorder_level,
    is_returnable = true,
    tax_rate = 0,
    track_batch_expiry = false,
  } = req.body;

  // Validate required fields
  if (!name || !unit || selling_price === undefined || cost_price === undefined) {
    throw new AppError('Name, unit, cost_price, and selling_price are required', 400);
  }

  if (selling_price < cost_price) {
    throw new AppError('Selling price cannot be less than cost price', 400);
  }

  // Check SKU uniqueness if provided
  if (sku) {
    const { data: existingSku } = await supabase
      .from('products')
      .select('id')
      .eq('sku', sku)
      .single();
    if (existingSku) throw new AppError('SKU already exists', 409);
  }

  // Check barcode uniqueness if provided
  if (barcode) {
    const { data: existingBarcode } = await supabase
      .from('products')
      .select('id')
      .eq('barcode', barcode)
      .single();
    if (existingBarcode) throw new AppError('Barcode already exists', 409);
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      sku,
      barcode,
      category_id,
      unit,
      cost_price,
      selling_price,
      reorder_level: reorder_level || 0,
      is_returnable,
      tax_rate,
      track_batch_expiry,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to create product', 500);
  res.status(201).json(data);
};

// Update product
export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates: any = {};

  const allowedFields = [
    'name',
    'sku',
    'barcode',
    'category_id',
    'unit',
    'cost_price',
    'selling_price',
    'reorder_level',
    'is_returnable',
    'tax_rate',
    'track_batch_expiry',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (updates.cost_price !== undefined && updates.selling_price !== undefined) {
    if (updates.selling_price < updates.cost_price) {
      throw new AppError('Selling price cannot be less than cost price', 400);
    }
  }

  if (updates.sku) {
    const { data: existingSku } = await supabase
      .from('products')
      .select('id')
      .eq('sku', updates.sku)
      .neq('id', id)
      .single();
    if (existingSku) throw new AppError('SKU already exists', 409);
  }

  if (updates.barcode) {
    const { data: existingBarcode } = await supabase
      .from('products')
      .select('id')
      .eq('barcode', updates.barcode)
      .neq('id', id)
      .single();
    if (existingBarcode) throw new AppError('Barcode already exists', 409);
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError('Failed to update product', 500);
  res.json(data);
};

// Delete product (only if no stock or sales)
export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if product has any stock batches with quantity
  const { data: stock } = await supabase
    .from('stock_batches')
    .select('id')
    .eq('product_id', id)
    .gt('quantity_remaining', 0)
    .limit(1);

  if (stock && stock.length > 0) {
    throw new AppError('Cannot delete product with existing stock', 400);
  }

  // Check if product has been sold
  const { data: saleItems } = await supabase
    .from('sale_items')
    .select('id')
    .eq('product_id', id)
    .limit(1);

  if (saleItems && saleItems.length > 0) {
    throw new AppError('Cannot delete product with sales history', 400);
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw new AppError('Failed to delete product', 500);
  res.json({ message: 'Product deleted successfully' });
};
