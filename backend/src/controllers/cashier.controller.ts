import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List all cashiers (active first)
export const listCashiers = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('cashiers')
    .select('id, full_name, status, created_at')
    .order('full_name', { ascending: true });

  if (error) throw new AppError('Failed to fetch cashiers', 500);
  res.json(data);
};

// Get active cashiers only (for dropdown in POS/purchases)
export const listActiveCashiers = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('cashiers')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  if (error) throw new AppError('Failed to fetch cashiers', 500);
  res.json(data);
};

// Create new cashier (name only, no password)
export const createCashier = async (req: Request, res: Response) => {
  const { fullName } = req.body;

  if (!fullName || !fullName.trim()) {
    throw new AppError('Cashier name is required', 400);
  }

  // Check if name already exists (case-insensitive)
  const { data: existing } = await supabaseAdmin
    .from('cashiers')
    .select('id')
    .ilike('full_name', fullName.trim())
    .single();

  if (existing) throw new AppError('Cashier already exists', 409);

  const { data, error } = await supabaseAdmin
    .from('cashiers')
    .insert({ full_name: fullName.trim() })
    .select()
    .single();

  if (error) throw new AppError('Failed to create cashier', 500);
  res.status(201).json(data);
};

// Update cashier name or status
export const updateCashier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, status } = req.body;

  const updates: any = {};
  if (fullName) updates.full_name = fullName;
  if (status) updates.status = status;

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400);
  }

  const { data, error } = await supabaseAdmin
    .from('cashiers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError('Failed to update cashier', 500);
  res.json(data);
};

// Deactivate cashier
export const deactivateCashier = async (req: Request, res: Response) => {
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('cashiers')
    .update({ status: 'inactive' })
    .eq('id', id);

  if (error) throw new AppError('Failed to deactivate cashier', 500);
  res.json({ message: 'Cashier deactivated' });
};

// Activate cashier
export const activateCashier = async (req: Request, res: Response) => {
  const { id } = req.params;

  const { error } = await supabaseAdmin
    .from('cashiers')
    .update({ status: 'active' })
    .eq('id', id);

  if (error) throw new AppError('Failed to activate cashier', 500);
  res.json({ message: 'Cashier activated' });
};
