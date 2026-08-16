import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

// Login with username and password
export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError('Username and password are required', 400);
  }

  // Find user by username in public.users
  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('id, full_name, username, email, role, status, password_hash')
    .eq('username', username)
    .single();

  if (userError || !userRecord) {
    throw new AppError('Invalid credentials', 401);
  }

  if (userRecord.status !== 'active') {
    throw new AppError('Account is deactivated. Contact administrator.', 403);
  }

  // Check if password_hash exists, else invalid
  const passwordHash = userRecord.password_hash || '';
  if (!passwordHash) {
    throw new AppError('Invalid credentials', 401);
  }

  // Compare password with stored hash
  const validPassword = await bcrypt.compare(password, passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid credentials', 401);
  }

  // Generate JWT with user info and role
  const token = jwt.sign(
    {
      userId: userRecord.id,
      username: userRecord.username,
      role: userRecord.role,
      fullName: userRecord.full_name,
    },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      id: userRecord.id,
      username: userRecord.username,
      fullName: userRecord.full_name,
      role: userRecord.role,
    },
  });
};

// Get current user profile (protected)
export const getMe = async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ user });
};

// Logout (client-side discards token; no server-side action needed)
export const logout = async (req: Request, res: Response) => {
  res.json({ message: 'Logged out' });
};
