import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { users, userProfiles } from '../../database/schema';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /me - Get own profile
router.get('/me', async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.userId;
    const db = getDb();

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        profileCompleted: user.profileCompleted,
        hasPin: !!user.pinHash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      profile: profile
        ? {
            userId: profile.userId,
            cin: profile.cin,
            address: profile.address,
            firstName: profile.firstName,
            lastName: profile.lastName,
            birthDate: profile.birthDate,
          }
        : null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /me - Create/update own profile
router.put('/me', async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.userId;
    const { cin, address, firstName, lastName, birthDate } = req.body;
    const db = getDb();

    // Validation
    const errors: Record<string, string> = {};
    if (!cin || !cin.trim()) {
      errors.cin = 'Le CIN est requis';
    } else if (!/^\d{8}$/.test(cin.trim())) {
      errors.cin = 'Le CIN doit contenir exactement 8 chiffres';
    }
    if (!firstName || !firstName.trim()) errors.firstName = 'Le prénom est requis';
    if (!lastName || !lastName.trim()) errors.lastName = 'Le nom est requis';
    if (!birthDate || !birthDate.trim()) errors.birthDate = 'La date de naissance est requise';
    if (!address || !address.trim()) errors.address = "L'adresse est requise";

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      errors.birthDate = 'Format de date invalide (AAAA-MM-JJ)';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validation échouée', errors });
    }

    const now = new Date().toISOString();

    // Check if profile exists
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    if (existing) {
      // Update
      await db
        .update(userProfiles)
        .set({
          cin: cin.trim(),
          address: address.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate,
          updatedAt: now,
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      // Insert
      await db.insert(userProfiles).values({
        id: randomUUID(),
        userId,
        cin: cin.trim(),
        address: address.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Mark profile as completed
    await db
      .update(users)
      .set({ profileCompleted: true, updatedAt: now })
      .where(eq(users.id, userId));

    // Return updated user
    const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));

    res.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        fullName: updatedUser.fullName,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        profileCompleted: updatedUser.profileCompleted,
        hasPin: !!updatedUser.pinHash,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
      profile: {
        userId,
        cin: cin.trim(),
        address: address.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /change-password - Change own password
router.post('/change-password', async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.userId;
    const { currentPassword, newPassword } = req.body;
    const db = getDb();

    if (!currentPassword) {
      return res.status(400).json({ error: 'Le mot de passe actuel est requis' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Le mot de passe actuel est incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /create-pin - Create or update lock screen PIN
router.post('/create-pin', async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.userId;
    const { pin, currentPassword } = req.body;
    const db = getDb();

    // Validate PIN format
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'Le PIN doit contenir exactement 4 chiffres' });
    }

    // Require current password for security
    if (!currentPassword) {
      return res.status(400).json({ error: 'Le mot de passe actuel est requis' });
    }

    // Verify current password
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Le mot de passe actuel est incorrect' });
    }

    // Hash and store PIN
    const pinHash = await bcrypt.hash(pin, 10);
    const now = new Date().toISOString();

    await db
      .update(users)
      .set({ pinHash, updatedAt: now })
      .where(eq(users.id, userId));

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        profileCompleted: user.profileCompleted,
        hasPin: true,
        createdAt: user.createdAt,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error('Create PIN error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /verify-pin - Verify lock screen PIN
router.post('/verify-pin', async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.userId;
    const { pin } = req.body;
    const db = getDb();

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ success: false, error: 'Format de PIN invalide' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    if (!user.pinHash) {
      return res.status(400).json({ success: false, error: 'Aucun PIN configuré' });
    }

    const validPin = await bcrypt.compare(pin, user.pinHash);
    if (!validPin) {
      return res.status(403).json({ success: false, error: 'PIN incorrect' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Verify PIN error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export { router as profileRouter };
