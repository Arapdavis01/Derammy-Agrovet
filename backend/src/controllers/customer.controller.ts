import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List customers with optional search and pagination
export const listCustomers = async (req: Request, res: Response) => {
  const { search, page = 1, limit = 50 } = req.query as any;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from('customers')
    .select('*', { count: 'exact' })
    .order('name')
    .range(offset, offset + limitNum - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new AppError('Failed to fetch customers', 500);
  res.json({
    data,
    total: count || 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((count || 0) / limitNum),
  });
};

// Get single customer
export const getCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) throw new AppError('Customer not found', 404);
  res.json(data);
};

// Create new customer
export const createCustomer = async (req: Request, res: Response) => {
  const { name, phone, address, credit_limit = 0 } = req.body;
  if (!name) throw new AppError('Customer name is required', 400);

  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({
      name,
      phone,
      address,
      credit_limit,
      credit_balance: 0, // new customer starts with zero balance
      status: 'active',
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to create customer', 500);
  res.status(201).json(data);
};

// Update customer
export const updateCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates: any = {};
  const allowed = ['name', 'phone', 'address', 'credit_limit', 'status'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', 400);
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError('Failed to update customer', 500);
  res.json(data);
};

// Delete customer (only if no balance and no transactions)
export const deleteCustomer = async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('credit_balance')
    .eq('id', id)
    .single();

  if (!customer) throw new AppError('Customer not found', 404);
  if (Number(customer.credit_balance) > 0) {
    throw new AppError('Cannot delete customer with outstanding balance', 400);
  }

  // Check if customer has sales
  const { count } = await supabaseAdmin
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id);

  if (count && count > 0) {
    throw new AppError('Cannot delete customer with sales history', 400);
  }

  const { error } = await supabaseAdmin
    .from('customers')
    .delete()
    .eq('id', id);

  if (error) throw new AppError('Failed to delete customer', 500);
  res.json({ message: 'Customer deleted' });
};
