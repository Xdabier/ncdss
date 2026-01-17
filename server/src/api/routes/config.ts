import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../../database';
import { erConfiguration, boxes } from '../../database/schema';
import { randomUUID } from 'crypto';
import { BoxType } from '@ncdss/shared';
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

    const {
      inscriptionDesks,
      triageBoxes,
      medicalBoxes,
      surgicalBoxes,
      traumaBoxes,
      sauvBeds
    } = req.body;

    const db = getDb();
    const [existing] = await db.select().from(erConfiguration).limit(1);

    if (existing) {
      await db.update(erConfiguration)
        .set({
          inscriptionDesks,
          triageBoxes,
          medicalBoxes,
          surgicalBoxes,
          traumaBoxes,
          sauvBeds,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .where(eq(erConfiguration.id, existing.id));
    }

    // Regenerate boxes based on new config
    await regenerateBoxes({
      triageBoxes,
      medicalBoxes,
      surgicalBoxes,
      traumaBoxes,
      sauvBeds
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

async function regenerateBoxes(config: {
  triageBoxes: number;
  medicalBoxes: number;
  surgicalBoxes: number;
  traumaBoxes: number;
  sauvBeds: number;
}) {
  const db = getDb();

  // Deactivate all existing boxes
  await db.update(boxes).set({ isActive: false });

  // Create new boxes
  const boxesToCreate: { id: string; name: string; boxType: string; isActive: boolean }[] = [];

  for (let i = 1; i <= config.triageBoxes; i++) {
    boxesToCreate.push({ id: randomUUID(), name: `Box Triage ${i}`, boxType: BoxType.TRIAGE, isActive: true });
  }
  for (let i = 1; i <= config.medicalBoxes; i++) {
    boxesToCreate.push({ id: randomUUID(), name: `Box Médical ${i}`, boxType: BoxType.MEDICAL, isActive: true });
  }
  for (let i = 1; i <= config.surgicalBoxes; i++) {
    boxesToCreate.push({ id: randomUUID(), name: `Box Chirurgical ${i}`, boxType: BoxType.SURGICAL, isActive: true });
  }
  for (let i = 1; i <= config.traumaBoxes; i++) {
    boxesToCreate.push({ id: randomUUID(), name: `Box Traumato ${i}`, boxType: BoxType.TRAUMA, isActive: true });
  }
  for (let i = 1; i <= config.sauvBeds; i++) {
    boxesToCreate.push({ id: randomUUID(), name: `SAUV Lit ${i}`, boxType: BoxType.SAUV, isActive: true });
  }

  if (boxesToCreate.length > 0) {
    await db.insert(boxes).values(boxesToCreate);
  }
}

export { router as configRouter };
