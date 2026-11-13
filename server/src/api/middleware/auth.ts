import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Environment-based JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'ncdss-dev-secret-DO-NOT-USE-IN-PRODUCTION';

// Fail on startup if the secret is not set in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET must be set in production');
    process.exit(1);
  }
}

export { JWT_SECRET };

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    (req as AuthRequest).user = decoded;

    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}
