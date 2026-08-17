import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

export const listSuppliers = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .select('*')
    .order('name');

  if (error) throw new AppError('Failed to fetch suppliers', 500);
  res.json(data);
};

export const createSupplier = async (req: Request, res: Response) => {
  const { name, phone, address } = req.body;
  if (!name) throw new AppError('Supplier name is required', 400);

  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .insert({ name, phone, address })
    .select()
    .single();

  if (error) throw new AppError('Failed to create supplier', 500);
  res.status(201).json(data);
};

export const updateSupplier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;
  const updates: any = {};
  if (name) updates.name = name;
  if (phone) updates.phone = phone;
  if (address) updates.address = address;

  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError('Failed to update supplier', 500);
  res.json(data);
};

export const deleteSupplier = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin
    .from('suppliers')
    .delete()
    .eq('id', id);

  if (error) throw new AppError('Failed to delete supplier', 500);
  res.json({ message: 'Supplier deleted' });
};
