import { Router } from 'express';
import { eq, like } from 'drizzle-orm';
import { getDb } from '../../database';
import { pathologyClassification } from '../../database/schema';

const router = Router();

// List pathologies
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    const db = getDb();

    let query = db.select().from(pathologyClassification);

    if (search) {
      query = query.where(like(pathologyClassification.pathologyName, `%${search}%`)) as any;
    }

    if (category) {
      query = query.where(eq(pathologyClassification.category, category as string)) as any;
    }

    const result = await query;
    res.json(result);
  } catch (error) {
    console.error('List pathologies error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get unique categories
router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.selectDistinct({ category: pathologyClassification.category })
      .from(pathologyClassification);
    res.json(result.map(r => r.category));
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bulk import
router.post('/import', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { pathologies } = req.body;
    // pathologies: [{ pathologyName, category }]

    const db = getDb();

    let imported = 0;
    let skipped = 0;

    for (const p of pathologies) {
      // Determine primary orientation from category
      let primaryOrientation = 'MEDICAL';
      const cat = p.category.toUpperCase();

      if (cat.includes('SAUV')) primaryOrientation = 'SAUV';
      else if (cat.includes('CHIRURGICAL')) primaryOrientation = 'SURGICAL';
      else if (cat.includes('TRAUMATO')) primaryOrientation = 'TRAUMA';

      const isMultiCategory = p.category.includes('/');

      try {
        await db.insert(pathologyClassification).values({
          pathologyName: p.pathologyName,
          category: p.category,
          primaryOrientation,
          isMultiCategory
        });
        imported++;
      } catch (e) {
        // Likely duplicate
        skipped++;
      }
    }

    res.json({ imported, skipped });
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

    const { pathologyName, category, primaryOrientation } = req.body;
    const db = getDb();

    const isMultiCategory = category.includes('/');

    await db.insert(pathologyClassification).values({
      pathologyName,
      category,
      primaryOrientation,
      isMultiCategory
    });

    res.status(201).json({ message: 'Pathologie créée' });
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

    const { pathologyName, category, primaryOrientation } = req.body;
    const { id } = req.params;
    const db = getDb();

    const isMultiCategory = category.includes('/');

    await db.update(pathologyClassification)
      .set({
        pathologyName,
        category,
        primaryOrientation,
        isMultiCategory,
        updatedAt: new Date().toISOString()
      })
      .where(eq(pathologyClassification.id, parseInt(id)));

    res.json({ message: 'Pathologie mise à jour' });
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
    await db.delete(pathologyClassification)
      .where(eq(pathologyClassification.id, parseInt(req.params.id)));

    res.json({ message: 'Pathologie supprimée' });
  } catch (error) {
    console.error('Delete pathology error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as pathologiesRouter };
