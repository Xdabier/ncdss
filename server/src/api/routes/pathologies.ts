import { Router } from 'express';
import { eq, like, or, and } from 'drizzle-orm';
import { getDb } from '../../database';
import { presentingComplaints } from '../../database/schema';
import { normalizeText, mapCategoryToOrientation } from '../../utils/textNormalization';

const router = Router();

// Transform DB result to API response
function transformResult(r: any) {
  return {
    id: r.id,
    name: r.name,
    nameNormalized: r.nameNormalized,
    // Keep backward compatibility
    pathologyName: r.name,
    category: r.category,
    primaryOrientation: r.primaryOrientation,
    secondaryOrientation: r.secondaryOrientation,
    isMultiCategory: r.isMultiCategory,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

// List presenting complaints (motifs de consultation)
router.get('/', async (req, res) => {
  try {
    const { search, category, orientation } = req.query;
    const db = getDb();

    let query = db.select().from(presentingComplaints);
    const conditions = [];

    if (search) {
      const normalizedSearch = normalizeText(search as string);
      conditions.push(
        or(
          like(presentingComplaints.name, `%${search}%`),
          like(presentingComplaints.nameNormalized, `%${normalizedSearch}%`)
        )
      );
    }

    if (category) {
      conditions.push(like(presentingComplaints.category, `%${category}%`));
    }

    if (orientation) {
      conditions.push(eq(presentingComplaints.primaryOrientation, orientation as string));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query;
    res.json(result.map(transformResult));
  } catch (error) {
    console.error('List pathologies error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Search presenting complaints (autocomplete endpoint)
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json([]);
    }

    const db = getDb();
    const normalizedQuery = normalizeText(q);

    const result = await db
      .select()
      .from(presentingComplaints)
      .where(
        or(
          like(presentingComplaints.name, `%${q}%`),
          like(presentingComplaints.nameNormalized, `%${normalizedQuery}%`)
        )
      )
      .limit(Number(limit));

    res.json(result.map(transformResult));
  } catch (error) {
    console.error('Search pathologies error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get unique categories
router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .selectDistinct({ category: presentingComplaints.category })
      .from(presentingComplaints);
    res.json(result.map((r) => r.category).sort());
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get unique orientations
router.get('/orientations', async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .selectDistinct({ orientation: presentingComplaints.primaryOrientation })
      .from(presentingComplaints);
    res.json(result.map((r) => r.orientation).sort());
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single presenting complaint by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [result] = await db
      .select()
      .from(presentingComplaints)
      .where(eq(presentingComplaints.id, parseInt(id)));

    if (!result) {
      return res.status(404).json({ error: 'Motif de consultation non trouvé' });
    }

    res.json(transformResult(result));
  } catch (error) {
    console.error('Get pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bulk import (used by seed script)
router.post('/import', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { pathologies } = req.body;
    const db = getDb();

    // Clear existing data before import
    await db.delete(presentingComplaints);

    let imported = 0;

    for (const p of pathologies) {
      // Support both old format (pathologyName) and new format (name)
      const name = p.name || p.pathologyName;
      const nameNormalized = p.nameNormalized || normalizeText(name);

      // Determine orientations from category if not provided
      let primaryOrientation = p.primaryOrientation;
      let secondaryOrientation = p.secondaryOrientation;
      const isMultiCategory = p.isMultiCategory ?? p.category?.includes('/') ?? false;

      if (!primaryOrientation) {
        const parts = p.category?.split('/') || ['Médical'];
        primaryOrientation = mapCategoryToOrientation(parts[0]);
        if (parts.length > 1) {
          secondaryOrientation = mapCategoryToOrientation(parts[1]);
        }
      }

      await db.insert(presentingComplaints).values({
        name,
        nameNormalized,
        category: p.category || 'Médical',
        primaryOrientation: primaryOrientation || 'MEDICAL',
        secondaryOrientation: secondaryOrientation || null,
        isMultiCategory,
      });
      imported++;
    }

    res.json({ imported });
  } catch (error) {
    console.error('Import pathologies error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create single
router.post('/', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { name, pathologyName, category, primaryOrientation, secondaryOrientation } = req.body;
    const db = getDb();

    const finalName = name || pathologyName;
    const isMultiCategory = category?.includes('/') ?? false;

    await db.insert(presentingComplaints).values({
      name: finalName,
      nameNormalized: normalizeText(finalName),
      category,
      primaryOrientation: primaryOrientation || mapCategoryToOrientation(category),
      secondaryOrientation,
      isMultiCategory,
    });

    res.status(201).json({ message: 'Motif de consultation créé' });
  } catch (error) {
    console.error('Create pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { name, pathologyName, category, primaryOrientation, secondaryOrientation } = req.body;
    const { id } = req.params;
    const db = getDb();

    const finalName = name || pathologyName;
    const isMultiCategory = category?.includes('/') ?? false;

    await db
      .update(presentingComplaints)
      .set({
        name: finalName,
        nameNormalized: normalizeText(finalName),
        category,
        primaryOrientation: primaryOrientation || mapCategoryToOrientation(category),
        secondaryOrientation,
        isMultiCategory,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(presentingComplaints.id, parseInt(id)));

    res.json({ message: 'Motif de consultation mis à jour' });
  } catch (error) {
    console.error('Update pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();
    await db
      .delete(presentingComplaints)
      .where(eq(presentingComplaints.id, parseInt(req.params.id)));

    res.json({ message: 'Motif de consultation supprimé' });
  } catch (error) {
    console.error('Delete pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as pathologiesRouter };
