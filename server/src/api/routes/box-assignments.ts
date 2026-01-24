import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { boxAssignments, boxes, users } from '../../database/schema';

const router = Router();

// List assignments with doctor and box details
router.get('/', async (req, res) => {
  try {
    const db = getDb();

    const result = await db
      .select({
        id: boxAssignments.id,
        boxId: boxAssignments.boxId,
        boxName: boxes.name,
        boxType: boxes.boxType,
        doctorId: boxAssignments.doctorId,
        doctorName: users.fullName,
        shift: boxAssignments.shift,
        effectiveDate: boxAssignments.effectiveDate,
        isActive: boxAssignments.isActive,
      })
      .from(boxAssignments)
      .innerJoin(boxes, eq(boxAssignments.boxId, boxes.id))
      .innerJoin(users, eq(boxAssignments.doctorId, users.id))
      .where(eq(boxAssignments.isActive, true));

    res.json(result);
  } catch (error) {
    console.error('List box assignments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create assignment
router.post('/', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { boxId, doctorId, shift, effectiveDate } = req.body;
    const db = getDb();

    // Deactivate existing assignment for this box/shift if any
    await db
      .update(boxAssignments)
      .set({ isActive: false })
      .where(
        and(
          eq(boxAssignments.boxId, boxId),
          eq(boxAssignments.shift, shift),
          eq(boxAssignments.isActive, true)
        )
      );

    // Create new assignment
    const id = randomUUID();
    await db.insert(boxAssignments).values({
      id,
      boxId,
      doctorId,
      shift,
      effectiveDate,
      isActive: true,
    });

    res.status(201).json({ id });
  } catch (error) {
    console.error('Create box assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Remove assignment
router.delete('/:id', async (req, res) => {
  try {
    const { role } = (req as any).user;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();
    await db
      .update(boxAssignments)
      .set({ isActive: false })
      .where(eq(boxAssignments.id, req.params.id));

    res.json({ message: 'Affectation supprimée' });
  } catch (error) {
    console.error('Delete box assignment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as boxAssignmentsRouter };
