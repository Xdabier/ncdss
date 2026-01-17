import { Router } from 'express';
import { eq, like } from 'drizzle-orm';
import { getDb } from '../../database';
import { abcdeInterventions } from '../../database/schema';

const router = Router();

// List interventions
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    const db = getDb();

    let query = db.select().from(abcdeInterventions);

    if (search) {
      query = query.where(like(abcdeInterventions.pathologyName, `%${search}%`)) as any;
    }

    if (category) {
      query = query.where(eq(abcdeInterventions.abcdeCategory, category as string)) as any;
    }

    const result = await query;
    res.json(result);
  } catch (error) {
    console.error('List interventions error:', error);
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

    const { interventions } = req.body;
    const db = getDb();

    let imported = 0;

    for (const intervention of interventions) {
      await db.insert(abcdeInterventions).values({
        pathologyName: intervention.pathologyName,
        abcdeCategory: intervention.abcdeCategory,
        severitySigns: intervention.severitySigns,
        nursingInterventions: intervention.nursingInterventions,
        medicalInterventions: intervention.medicalInterventions,
        dosageFormulas: intervention.dosageFormulas
      });
      imported++;
    }

    res.json({ imported });
  } catch (error) {
    console.error('Import interventions error:', error);
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

    const { pathologyName, abcdeCategory, severitySigns, nursingInterventions, medicalInterventions, dosageFormulas } = req.body;
    const db = getDb();

    await db.insert(abcdeInterventions).values({
      pathologyName,
      abcdeCategory,
      severitySigns,
      nursingInterventions,
      medicalInterventions,
      dosageFormulas
    });

    res.status(201).json({ message: 'Intervention créée' });
  } catch (error) {
    console.error('Create intervention error:', error);
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

    const { pathologyName, abcdeCategory, severitySigns, nursingInterventions, medicalInterventions, dosageFormulas } = req.body;
    const { id } = req.params;
    const db = getDb();

    await db.update(abcdeInterventions)
      .set({
        pathologyName,
        abcdeCategory,
        severitySigns,
        nursingInterventions,
        medicalInterventions,
        dosageFormulas,
        updatedAt: new Date().toISOString()
      })
      .where(eq(abcdeInterventions.id, parseInt(id)));

    res.json({ message: 'Intervention mise à jour' });
  } catch (error) {
    console.error('Update intervention error:', error);
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
    await db.delete(abcdeInterventions)
      .where(eq(abcdeInterventions.id, parseInt(req.params.id)));

    res.json({ message: 'Intervention supprimée' });
  } catch (error) {
    console.error('Delete intervention error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as interventionsRouter };
