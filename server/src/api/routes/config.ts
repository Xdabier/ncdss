import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../../database';
import { erConfiguration, boxes } from '../../database/schema';
import { buildBoxesForLayout, type BoxLayout } from '../../services/boxLayout';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get ER Configuration
router.get('/er', async (req, res) => {
  try {
    const db = getDb();
    const [config] = await db.select().from(erConfiguration).limit(1);
    res.json(config);
  } catch (error) {
    console.error('Get ER config error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update ER Configuration (Admin only)
router.put('/er', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, role } = authReq.user || {};

    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { inscriptionDesks, triageBoxes, medicalBoxes, surgicalBoxes, traumaBoxes, sauvBeds, dechocageBeds } =
      req.body;

    const db = getDb();
    const [existing] = await db.select().from(erConfiguration).limit(1);

    if (existing) {
      await db
        .update(erConfiguration)
        .set({
          inscriptionDesks,
          triageBoxes,
          medicalBoxes,
          surgicalBoxes,
          traumaBoxes,
          sauvBeds,
          dechocageBeds,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(erConfiguration.id, existing.id));
    }

    // Regenerate boxes based on new config
    await regenerateBoxes({
      triageBoxes,
      medicalBoxes,
      surgicalBoxes,
      traumaBoxes,
      sauvBeds,
      dechocageBeds,
    });

    const [updated] = await db.select().from(erConfiguration).limit(1);
    res.json(updated);
  } catch (error) {
    console.error('Update ER config error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get all boxes
router.get('/boxes', async (req, res) => {
  try {
    const db = getDb();
    const allBoxes = await db.select().from(boxes).where(eq(boxes.isActive, true));
    res.json(allBoxes);
  } catch (error) {
    console.error('Get boxes error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function regenerateBoxes(layout: BoxLayout): Promise<void> {
  const db = getDb();

  // Deactivate all existing boxes
  await db.update(boxes).set({ isActive: false });

  const boxesToCreate = buildBoxesForLayout(layout);
  if (boxesToCreate.length > 0) {
    await db.insert(boxes).values(boxesToCreate);
  }
}

export { router as configRouter };
