import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { users, weeklySchedule, refreshTokens } from '../../database/schema';
import { JWT_SECRET } from '../middleware/auth';
import { logAuditEvent } from '../middleware/audit';

const router = Router();
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    if (!username || !password) {
      return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.username, username));

    if (!user || !user.isActive) {
      // Log failed login attempt
      await logAuditEvent('LOGIN_FAILED', 'auth', {
        reason: !user ? 'user_not_found' : 'user_inactive',
        attemptedUsername: username,
        ipAddress,
        userAgent,
      }, null, username);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      // Log failed login attempt
      await logAuditEvent('LOGIN_FAILED', 'auth', {
        reason: 'invalid_password',
        attemptedUsername: username,
        ipAddress,
        userAgent,
      }, user.id, username);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Get today's assignment and shift info for nurses
    let todayAssignment: string | undefined;
    let todayShiftInfo: { shiftPreset: string | null; shiftStart: string | null; shiftEnd: string | null } | undefined;
    if (user.role === 'NURSE') {
      const today = new Date();
      const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0
      const weekStart = getWeekStart(today);

      const [schedule] = await db
        .select()
        .from(weeklySchedule)
        .where(
          and(
            eq(weeklySchedule.nurseId, user.id),
            eq(weeklySchedule.weekStart, weekStart),
            eq(weeklySchedule.dayOfWeek, dayOfWeek)
          )
        );

      todayAssignment = schedule?.assignedRole || 'OFF';
      if (schedule) {
        todayShiftInfo = {
          shiftPreset: schedule.shiftPreset ?? null,
          shiftStart: schedule.shiftStart ?? null,
          shiftEnd: schedule.shiftEnd ?? null,
        };
      }
    }

    // Generate access token (short-lived)
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    // Generate refresh token (long-lived)
    const refreshToken = randomUUID();
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // Store refresh token in database
    await db.insert(refreshTokens).values({
      id: randomUUID(),
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry.toISOString(),
    });

    // Log successful login
    await logAuditEvent('LOGIN_SUCCESS', 'auth', {
      role: user.role,
      todayAssignment,
      ipAddress,
      userAgent,
    }, user.id, user.username);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        profileCompleted: user.profileCompleted ?? true,
        hasPin: !!user.pinHash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      todayAssignment,
      todayShiftInfo,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId));

    if (!user || !user.isActive) {
      return res.status(401).json({ valid: false });
    }

    res.json({ valid: true, user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      profileCompleted: user.profileCompleted ?? true,
      hasPin: !!user.pinHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    } });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requis' });
    }

    const db = getDb();

    // Find refresh token in database
    const [tokenRecord] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, refreshToken));

    if (!tokenRecord) {
      return res.status(401).json({ error: 'Refresh token invalide' });
    }

    // Check if token is revoked
    if (tokenRecord.revokedAt) {
      return res.status(401).json({ error: 'Refresh token révoqué' });
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(tokenRecord.expiresAt);
    if (now > expiresAt) {
      return res.status(401).json({ error: 'Refresh token expiré' });
    }

    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, tokenRecord.userId));

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Utilisateur inactif' });
    }

    // Get today's assignment and shift info for nurses
    let todayAssignment: string | undefined;
    let todayShiftInfo: { shiftPreset: string | null; shiftStart: string | null; shiftEnd: string | null } | undefined;
    if (user.role === 'NURSE') {
      const today = new Date();
      const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0
      const weekStart = getWeekStart(today);

      const [schedule] = await db
        .select()
        .from(weeklySchedule)
        .where(
          and(
            eq(weeklySchedule.nurseId, user.id),
            eq(weeklySchedule.weekStart, weekStart),
            eq(weeklySchedule.dayOfWeek, dayOfWeek)
          )
        );

      todayAssignment = schedule?.assignedRole || 'OFF';
      if (schedule) {
        todayShiftInfo = {
          shiftPreset: schedule.shiftPreset ?? null,
          shiftStart: schedule.shiftStart ?? null,
          shiftEnd: schedule.shiftEnd ?? null,
        };
      }
    }

    // Generate new access token
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        profileCompleted: user.profileCompleted ?? true,
        hasPin: !!user.pinHash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      todayAssignment,
      todayShiftInfo,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token requis' });
    }

    const db = getDb();

    // Revoke the refresh token
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(refreshTokens.token, refreshToken));

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Cleanup expired tokens (can be called periodically)
router.post('/cleanup-tokens', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    // Delete expired refresh tokens
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));

    res.json({ message: 'Tokens expirés nettoyés' });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export { router as authRouter };
