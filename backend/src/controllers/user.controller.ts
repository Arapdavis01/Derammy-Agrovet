import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// List all users (admin only)
export const listUsers = async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, username, email, role, status, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new AppError('Failed to fetch users', 500);
  res.json(data);
};

// Create new user (admin only)
export const createUser = async (req: Request, res: Response) => {
  const { fullName, username, password, role } = req.body;

  if (!fullName || !username || !password || !role) {
    throw new AppError('Full name, username, password, and role are required', 400);
  }

  const validRoles = ['admin', 'cashier', 'manager'];
  if (!validRoles.includes(role)) {
    throw new AppError('Invalid role', 400);
  }

  // Check if username already exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) throw new AppError('Username already exists', 409);

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Generate email from username (for display/record only)
  const email = `${username.toLowerCase()}@derammy.agrovet`;

  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({
      id: uuidv4(),
      full_name: fullName,
      username,
      email,
      role,
      status: 'active',
      password_hash: passwordHash,
    })
    .select('id, full_name, username, email, role, status, created_at')
    .single();

  if (error) throw new AppError('Failed to create user', 500);
  res.status(201).json(newUser);
};

// Update user (admin only)
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, username, role, status } = req.body;

  const updates: any = {};
  if (fullName) updates.full_name = fullName;
  if (username) {
    updates.username = username;
    updates.email = `${username.toLowerCase()}@derammy.agrovet`;
  }
  if (role) updates.role = role;
  if (status) updates.status = status;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, full_name, username, email, role, status, created_at')
    .single();

  if (error) throw new AppError('Failed to update user', 400);
  res.json(data);
};

// Reset password (admin only)
export const resetPassword = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) throw new AppError('New password is required', 400);

  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  const { error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', id);

  if (error) throw new AppError('Failed to reset password', 400);
  res.json({ message: 'Password updated successfully' });
};

// Deactivate user (soft delete)
export const deactivateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, full_name, username, role, status')
    .single();

  if (error) throw new AppError('Failed to deactivate user', 400);
  res.json(data);
};
