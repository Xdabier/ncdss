import { Router } from 'express';
import { eq, like, or, and } from 'drizzle-orm';
import { getDb } from '../../database';
import { clinicalPathologies } from '../../database/schema';
import { normalizeText, parseOrientation } from '../../utils/textNormalization';

const router = Router();

// Helper functions for JSON array handling
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringifyArray(value: any): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return JSON.stringify([]);
}

// Transform DB result to API response
function transformResult(r: any) {
  return {
    id: r.id,
    pathologyName: r.pathologyName,
    pathologyNameNormalized: r.pathologyNameNormalized,
    abcdeCategory: r.abcdeCategory,
    category: r.abcdeCategory, // Alias for backward compatibility
    severitySigns: parseJsonArray(r.severitySigns),
    nursingInterventions: parseJsonArray(r.nursingInterventions),
    medicalInterventions: parseJsonArray(r.medicalInterventions),
    dosageFormulas: r.dosageFormulas || '',
    orientation: r.orientation || '',
    primaryOrientation: r.primaryOrientation || 'MEDICAL',
    secondaryOrientation: r.secondaryOrientation,
    isSAUV: r.isSAUV || false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

// List interventions (clinical pathologies)
router.get('/', async (req, res) => {
  try {
    const { search, category, orientation, sauv } = req.query;
    const db = getDb();

    let query = db.select().from(clinicalPathologies);
    const conditions = [];

    if (search) {
      const normalizedSearch = normalizeText(search as string);
      conditions.push(
        or(
          like(clinicalPathologies.pathologyName, `%${search}%`),
          like(clinicalPathologies.pathologyNameNormalized, `%${normalizedSearch}%`)
        )
      );
    }

    if (category) {
      conditions.push(eq(clinicalPathologies.abcdeCategory, category as string));
    }

    if (orientation) {
      conditions.push(eq(clinicalPathologies.primaryOrientation, orientation as string));
    }

    if (sauv === 'true') {
      conditions.push(eq(clinicalPathologies.isSAUV, true));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query;
    const parsed = result.map(transformResult);

    res.json(parsed);
  } catch (error) {
    console.error('List interventions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get unique ABCDE categories
router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    const result = await db
      .selectDistinct({ category: clinicalPathologies.abcdeCategory })
      .from(clinicalPathologies);

    res.json(result.map(r => r.category).sort());
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get interventions by pathology name (for matching)
router.get('/by-pathology/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const normalizedName = normalizeText(name);
    const db = getDb();

    const result = await db
      .select()
      .from(clinicalPathologies)
      .where(
        or(
          eq(clinicalPathologies.pathologyName, name),
          eq(clinicalPathologies.pathologyNameNormalized, normalizedName)
        )
      );

    res.json(result.map(transformResult));
  } catch (error) {
    console.error('Get by pathology error:', error);
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

    const { interventions } = req.body;
    const db = getDb();

    // Clear existing data before import
    await db.delete(clinicalPathologies);

    let imported = 0;

    for (const intervention of interventions) {
      // Handle both old format (without orientation) and new format (with orientation)
      const orientationRaw = intervention.orientation || '';
      let primaryOrientation = intervention.primaryOrientation;
      let secondaryOrientation = intervention.secondaryOrientation;
      let isSAUV = intervention.isSAUV;

      // If not provided, parse from orientation string
      if (!primaryOrientation && orientationRaw) {
        const parsed = parseOrientation(orientationRaw);
        primaryOrientation = parsed.primary;
        secondaryOrientation = parsed.secondary;
        isSAUV = parsed.isSAUV;
      }

      await db.insert(clinicalPathologies).values({
        pathologyName: intervention.pathologyName,
        pathologyNameNormalized: intervention.pathologyNameNormalized || normalizeText(intervention.pathologyName),
        abcdeCategory: intervention.abcdeCategory,
        severitySigns: stringifyArray(intervention.severitySigns),
        nursingInterventions: stringifyArray(intervention.nursingInterventions),
        medicalInterventions: stringifyArray(intervention.medicalInterventions),
        dosageFormulas: intervention.dosageFormulas || '',
        orientation: orientationRaw,
        primaryOrientation: primaryOrientation || 'MEDICAL',
        secondaryOrientation: secondaryOrientation || null,
        isSAUV: isSAUV || false,
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

    const {
      pathologyName,
      abcdeCategory,
      severitySigns,
      nursingInterventions,
      medicalInterventions,
      dosageFormulas,
      orientation,
      primaryOrientation,
      secondaryOrientation,
      isSAUV,
    } = req.body;
    const db = getDb();

    // Parse orientation if not provided
    let finalPrimary = primaryOrientation;
    let finalSecondary = secondaryOrientation;
    let finalSAUV = isSAUV;

    if (!finalPrimary && orientation) {
      const parsed = parseOrientation(orientation);
      finalPrimary = parsed.primary;
      finalSecondary = parsed.secondary;
      finalSAUV = parsed.isSAUV;
    }

    await db.insert(clinicalPathologies).values({
      pathologyName,
      pathologyNameNormalized: normalizeText(pathologyName),
      abcdeCategory,
      severitySigns: stringifyArray(severitySigns),
      nursingInterventions: stringifyArray(nursingInterventions),
      medicalInterventions: stringifyArray(medicalInterventions),
      dosageFormulas: dosageFormulas || '',
      orientation: orientation || '',
      primaryOrientation: finalPrimary || 'MEDICAL',
      secondaryOrientation: finalSecondary,
      isSAUV: finalSAUV || false,
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

    const {
      pathologyName,
      abcdeCategory,
      severitySigns,
      nursingInterventions,
      medicalInterventions,
      dosageFormulas,
      orientation,
      primaryOrientation,
      secondaryOrientation,
      isSAUV,
    } = req.body;
    const { id } = req.params;
    const db = getDb();

    // Parse orientation if not provided
    let finalPrimary = primaryOrientation;
    let finalSecondary = secondaryOrientation;
    let finalSAUV = isSAUV;

    if (!finalPrimary && orientation) {
      const parsed = parseOrientation(orientation);
      finalPrimary = parsed.primary;
      finalSecondary = parsed.secondary;
      finalSAUV = parsed.isSAUV;
    }

    await db
      .update(clinicalPathologies)
      .set({
        pathologyName,
        pathologyNameNormalized: normalizeText(pathologyName),
        abcdeCategory,
        severitySigns: stringifyArray(severitySigns),
        nursingInterventions: stringifyArray(nursingInterventions),
        medicalInterventions: stringifyArray(medicalInterventions),
        dosageFormulas: dosageFormulas || '',
        orientation: orientation || '',
        primaryOrientation: finalPrimary || 'MEDICAL',
        secondaryOrientation: finalSecondary,
        isSAUV: finalSAUV || false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(clinicalPathologies.id, parseInt(id)));

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
    await db.delete(clinicalPathologies).where(eq(clinicalPathologies.id, parseInt(req.params.id)));

    res.json({ message: 'Intervention supprimée' });
  } catch (error) {
    console.error('Delete intervention error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as interventionsRouter };
