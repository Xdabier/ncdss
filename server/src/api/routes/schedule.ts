import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { weeklySchedule, users } from '../../database/schema';
import { NurseAssignment } from '@ncdss/shared';

const router = Router();

// Get schedule for a week
router.get('/:weekStart', async (req, res) => {
  try {
    const { weekStart } = req.params;
    const db = getDb();

    // Get all nurses
    const nurses = await db.select({
      id: users.id,
      fullName: users.fullName
    })
    .from(users)
    .where(and(
      eq(users.role, 'NURSE'),
      eq(users.isActive, true)
    ));

    // Get schedule entries for this week
    const schedules = await db.select()
      .from(weeklySchedule)
      .where(eq(weeklySchedule.weekStart, weekStart));

    // Build response: nurse -> day -> assignment
    const result = nurses.map(nurse => {
      const nurseSchedules = schedules.filter(s => s.nurseId === nurse.id);
      const days: Record<number, string> = {};

      for (let i = 0; i < 7; i++) {
        const daySchedule = nurseSchedules.find(s => s.dayOfWeek === i);
        days[i] = daySchedule?.assignedRole || NurseAssignment.OFF;
      }

      return {
        nurseId: nurse.id,
        nurseName: nurse.fullName,
        days
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Save schedule for a week
router.post('/:weekStart', async (req, res) => {
  try {
    const { role, userId } = (req as any).user;

    if (role !== 'NURSE_SUPERVISOR' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { weekStart } = req.params;
    const { schedules } = req.body;
    // schedules: [{ nurseId, days: { 0: 'INSCRIPTION', 1: 'TRIAGE', ... } }]

    const db = getDb();

    // Delete existing schedules for this week
    await db.delete(weeklySchedule)
      .where(eq(weeklySchedule.weekStart, weekStart));

    // Insert new schedules
    const entries = [];
    for (const nurseSchedule of schedules) {
      for (let day = 0; day < 7; day++) {
        const assignment = nurseSchedule.days[day];
        if (assignment && assignment !== NurseAssignment.OFF) {
          entries.push({
            id: randomUUID(),
            nurseId: nurseSchedule.nurseId,
            weekStart,
            dayOfWeek: day,
            assignedRole: assignment,
            createdBy: userId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    if (entries.length > 0) {
      await db.insert(weeklySchedule).values(entries);
    }

    res.json({ message: 'Planning sauvegardé' });
  } catch (error) {
    console.error('Save schedule error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Validate schedule (at least 1 per role per day)
router.post('/:weekStart/validate', async (req, res) => {
  try {
    const { schedules } = req.body;
    const errors: string[] = [];

    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    for (let day = 0; day < 7; day++) {
      const dayAssignments = schedules.map((s: any) => s.days[day]);

      const hasInscription = dayAssignments.includes(NurseAssignment.INSCRIPTION);
      const hasTriage = dayAssignments.includes(NurseAssignment.TRIAGE);
      const hasTreatment = dayAssignments.includes(NurseAssignment.TREATMENT);

      if (!hasInscription) {
        errors.push(`${dayNames[day]}: Aucun infirmier assigné à l'inscription`);
      }
      if (!hasTriage) {
        errors.push(`${dayNames[day]}: Aucun infirmier assigné au triage`);
      }
      if (!hasTreatment) {
        errors.push(`${dayNames[day]}: Aucun infirmier assigné aux soins`);
      }
    }

    res.json({ valid: errors.length === 0, errors });
  } catch (error) {
    console.error('Validate schedule error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as scheduleRouter };
