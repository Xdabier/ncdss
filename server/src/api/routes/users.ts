import { Router } from 'express';
import { eq, like, or, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { users } from '../../database/schema';
import { UserRole } from '@ncdss/shared';

const router = Router();

// List users with filters
router.get('/', async (req, res) => {
  try {
    const { search, role, isActive } = req.query;
    const db = getDb();

    let query = db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    }).from(users);

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(users.username, `%${search}%`),
          like(users.fullName, `%${search}%`)
        )
      );
    }

    if (role) {
      conditions.push(eq(users.role, role as string));
    }

    if (isActive !== undefined) {
      conditions.push(eq(users.isActive, isActive === 'true'));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query;
    res.json(result);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single user
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const [user] = await db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .where(eq(users.id, req.params.id));

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create user
router.post('/', async (req, res) => {
  try {
    const { role: callerRole } = (req as any).user;

    if (callerRole !== 'ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { username, password, fullName, role } = req.body;

    // Validation
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Validate role
    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Prevent creating SUPER_ADMIN unless caller is SUPER_ADMIN
    if (role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Seul un Super Admin peut créer un autre Super Admin' });
    }

    const db = getDb();

    // Check if username exists
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(users).values({
      id,
      username,
      passwordHash,
      fullName,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });

    const [newUser] = await db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .where(eq(users.id, id));

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { role: callerRole, userId: callerId } = (req as any).user;

    if (callerRole !== 'ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { fullName, role, isActive } = req.body;
    const { id } = req.params;

    const db = getDb();

    // Get existing user
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Prevent modifying SUPER_ADMIN unless caller is SUPER_ADMIN
    if (existing.role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Impossible de modifier un Super Admin' });
    }

    // Prevent self-deactivation
    if (id === callerId && isActive === false) {
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    }

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (fullName !== undefined) updateData.fullName = fullName;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    await db.update(users).set(updateData).where(eq(users.id, id));

    const [updated] = await db.select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    })
    .from(users)
    .where(eq(users.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Reset password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { role: callerRole } = (req as any).user;

    if (callerRole !== 'ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { password } = req.body;
    const { id } = req.params;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const db = getDb();

    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Prevent resetting SUPER_ADMIN password unless caller is SUPER_ADMIN
    if (existing.role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Impossible de modifier le mot de passe d\'un Super Admin' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.update(users).set({
      passwordHash,
      updatedAt: new Date().toISOString()
    }).where(eq(users.id, id));

    res.json({ message: 'Mot de passe réinitialisé' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get users by role (for dropdowns)
router.get('/by-role/:role', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.select({
      id: users.id,
      fullName: users.fullName
    })
    .from(users)
    .where(and(
      eq(users.role, req.params.role),
      eq(users.isActive, true)
    ));

    res.json(result);
  } catch (error) {
    console.error('Get users by role error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as usersRouter };
