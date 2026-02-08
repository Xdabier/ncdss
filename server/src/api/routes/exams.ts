import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { complementaryExams, patients, users } from '../../database/schema';
import { UserRole } from '@ncdss/shared';

const router = Router();

// ============================================================================
// Helper Functions
// ============================================================================

function isDoctorOrAdmin(role: string): boolean {
  return role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN;
}

function isNurseOrAbove(role: string): boolean {
  return role === UserRole.NURSE || role === UserRole.NURSE_SUPERVISOR ||
         role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN;
}

// Select fields with requester name join
const examSelectFields = {
  id: complementaryExams.id,
  patientId: complementaryExams.patientId,
  examName: complementaryExams.examName,
  examType: complementaryExams.examType,
  status: complementaryExams.status,
  priority: complementaryExams.priority,
  source: complementaryExams.source,
  notes: complementaryExams.notes,
  results: complementaryExams.results,
  requestedBy: complementaryExams.requestedBy,
  requestedAt: complementaryExams.requestedAt,
  startedAt: complementaryExams.startedAt,
  startedBy: complementaryExams.startedBy,
  completedAt: complementaryExams.completedAt,
  completedBy: complementaryExams.completedBy,
  cancelledAt: complementaryExams.cancelledAt,
  cancelledBy: complementaryExams.cancelledBy,
  cancelReason: complementaryExams.cancelReason,
  createdAt: complementaryExams.createdAt,
  updatedAt: complementaryExams.updatedAt,
  requestedByName: users.fullName,
} as const;

// ============================================================================
// GET /exams/patient/:patientId
// List all exams for a patient
// ============================================================================

router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const db = getDb();

    // Verify patient exists
    const [patient] = await db.select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId));

    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    const result = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.patientId, patientId))
      .orderBy(desc(complementaryExams.requestedAt));

    res.json(result);
  } catch (error) {
    console.error('List exams error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// GET /exams/:id
// Get single exam
// ============================================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [exam] = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.id, id));

    if (!exam) {
      return res.status(404).json({ error: 'Examen non trouvé' });
    }

    res.json(exam);
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /exams
// Create new exam request (Doctor only)
// ============================================================================

router.post('/', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;

    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent demander des examens' });
    }

    const { patientId, examName, examType, priority, source, notes } = req.body;

    // Validation
    if (!patientId) {
      return res.status(400).json({ error: 'Patient requis' });
    }
    if (!examName || !examName.trim()) {
      return res.status(400).json({ error: "Nom de l'examen requis" });
    }
    if (!examType || !examType.trim()) {
      return res.status(400).json({ error: "Type d'examen requis" });
    }

    const validTypes = ['IMAGING', 'BLOOD_WORK', 'SAMPLE', 'OTHER'];
    if (!validTypes.includes(examType.toUpperCase())) {
      return res.status(400).json({ error: `Type d'examen invalide. Valeurs: ${validTypes.join(', ')}` });
    }

    const db = getDb();

    // Verify patient exists
    const [patient] = await db.select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId));

    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await db.insert(complementaryExams).values({
      id,
      patientId,
      examName: examName.trim(),
      examType: examType.toUpperCase(),
      status: 'REQUESTED',
      priority: (priority || 'NORMAL').toUpperCase(),
      source: (source || 'DOCTOR').toUpperCase(),
      notes: notes?.trim() || null,
      requestedBy: userId,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Return created exam with requester info
    const [created] = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.id, id));

    res.status(201).json(created);
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// PUT /exams/:id
// Update exam details (Doctor only, REQUESTED status only)
// ============================================================================

router.put('/:id', async (req, res) => {
  try {
    const { role } = (req as any).user;

    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent modifier des examens' });
    }

    const { id } = req.params;
    const { examName, examType, priority, notes } = req.body;

    const db = getDb();

    const [exam] = await db.select()
      .from(complementaryExams)
      .where(eq(complementaryExams.id, id));

    if (!exam) {
      return res.status(404).json({ error: 'Examen non trouvé' });
    }

    if (exam.status !== 'REQUESTED') {
      return res.status(400).json({ error: `Impossible de modifier. Statut actuel: ${exam.status}` });
    }

    const updates: Record<string, unknown> = {};

    if (examName !== undefined) {
      if (!examName || !examName.trim()) {
        return res.status(400).json({ error: "Le nom de l'examen ne peut pas être vide" });
      }
      updates.examName = examName.trim();
    }
    if (examType !== undefined) {
      updates.examType = examType.toUpperCase();
    }
    if (priority !== undefined) {
      updates.priority = priority.toUpperCase();
    }
    if (notes !== undefined) {
      updates.notes = notes?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Au moins un champ à modifier est requis' });
    }

    updates.updatedAt = new Date().toISOString();

    await db.update(complementaryExams).set(updates).where(eq(complementaryExams.id, id));

    const [updated] = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// PUT /exams/:id/status
// Update exam status (Nurse can start/complete, Doctor can cancel)
// ============================================================================

router.put('/:id/status', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;

    if (!isNurseOrAbove(role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const { status, results, cancelReason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Statut requis' });
    }

    const validStatuses = ['REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({ error: `Statut invalide. Valeurs: ${validStatuses.join(', ')}` });
    }

    const db = getDb();

    const [exam] = await db.select()
      .from(complementaryExams)
      .where(eq(complementaryExams.id, id));

    if (!exam) {
      return res.status(404).json({ error: 'Examen non trouvé' });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: status.toUpperCase(),
      updatedAt: now,
    };

    const newStatus = status.toUpperCase();

    // Validate transitions
    if (newStatus === 'IN_PROGRESS') {
      if (exam.status !== 'REQUESTED') {
        return res.status(400).json({ error: `Transition invalide: ${exam.status} -> IN_PROGRESS` });
      }
      updates.startedAt = now;
      updates.startedBy = userId;
    } else if (newStatus === 'COMPLETED') {
      if (exam.status !== 'IN_PROGRESS' && exam.status !== 'REQUESTED') {
        return res.status(400).json({ error: `Transition invalide: ${exam.status} -> COMPLETED` });
      }
      if (!updates.startedAt && !exam.startedAt) {
        updates.startedAt = now;
        updates.startedBy = userId;
      }
      updates.completedAt = now;
      updates.completedBy = userId;
      if (results) {
        updates.results = results.trim();
      }
    } else if (newStatus === 'CANCELLED') {
      if (exam.status === 'COMPLETED' || exam.status === 'CANCELLED') {
        return res.status(400).json({ error: `Impossible d'annuler. Statut actuel: ${exam.status}` });
      }
      updates.cancelledAt = now;
      updates.cancelledBy = userId;
      if (cancelReason) {
        updates.cancelReason = cancelReason.trim();
      }
    }

    await db.update(complementaryExams).set(updates).where(eq(complementaryExams.id, id));

    const [updated] = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Update exam status error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /exams/:id/cancel
// Cancel exam (Doctor only)
// ============================================================================

router.post('/:id/cancel', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;

    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent annuler des examens' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const db = getDb();

    const [exam] = await db.select()
      .from(complementaryExams)
      .where(eq(complementaryExams.id, id));

    if (!exam) {
      return res.status(404).json({ error: 'Examen non trouvé' });
    }

    if (exam.status === 'COMPLETED' || exam.status === 'CANCELLED') {
      return res.status(400).json({ error: `Impossible d'annuler. Statut actuel: ${exam.status}` });
    }

    const now = new Date().toISOString();

    await db.update(complementaryExams).set({
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy: userId,
      cancelReason: reason?.trim() || null,
      updatedAt: now,
    }).where(eq(complementaryExams.id, id));

    const [updated] = await db.select(examSelectFields)
      .from(complementaryExams)
      .leftJoin(users, eq(complementaryExams.requestedBy, users.id))
      .where(eq(complementaryExams.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Cancel exam error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as examsRouter };
