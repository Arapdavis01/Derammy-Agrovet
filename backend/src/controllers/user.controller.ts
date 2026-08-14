import { Request, Response } from 'express';
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

  // Validate role
  const validRoles = ['admin', 'cashier', 'manager'];
  if (!validRoles.includes(role)) {
    throw new AppError('Invalid role', 400);
  }

  // Generate email from username
  const email = `${username.toLowerCase()}@derammy.agrovet`;

  // Create auth user in Supabase
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      username,
      role,
    },
  });

  if (authError) {
    throw new AppError(`Failed to create auth user: ${authError.message}`, 400);
  }

  // Insert into users table
  const { data: newUser, error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      full_name: fullName,
      username,
      email,
      role,
      status: 'active',
    })
    .select('id, full_name, username, email, role, status, created_at')
    .single();

  if (insertError) {
    // Rollback auth user if insert fails
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new AppError(`Failed to create user record: ${insertError.message}`, 400);
  }

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

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: newPassword,
  });

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
