import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { users, userProfiles } from '../../database/schema';

const router = Router();

// GET /me - Get own profile
router.get('/me', async (req, res) => {
  try {
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
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

export { router as profileRouter };
