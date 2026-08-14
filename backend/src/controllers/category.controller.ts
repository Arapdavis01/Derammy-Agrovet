import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List all categories
export const listCategories = async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new AppError('Failed to fetch categories', 500);
  res.json(data);
};

// Create a new category
export const createCategory = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw new AppError('Category name is required', 400);
  }

  // Check if category already exists
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', name.trim())
    .single();

  if (existing) {
    throw new AppError('Category already exists', 409);
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) throw new AppError('Failed to create category', 500);
  res.status(201).json(data);
};

// Update category
export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw new AppError('Category name is required', 400);
  }

  const { data, error } = await supabase
    .from('categories')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new AppError('Failed to update category', 500);
  res.json(data);
};

// Delete category
export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw new AppError('Failed to delete category', 500);
  res.json({ message: 'Category deleted successfully' });
};
