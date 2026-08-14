import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../utils/errorHandler';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as any;
    // Optionally fetch fresh user data from DB
    const { data: userRecord, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, username, role, status')
      .eq('id', decoded.userId)
      .single();

    if (error || !userRecord || userRecord.status !== 'active') {
      throw new AppError('User not found or inactive', 401);
    }

    req.user = userRecord;
    next();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid or expired token', 401);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError('Forbidden: insufficient permissions', 403);
    }
    next();
  };
};
