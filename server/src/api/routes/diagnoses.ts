import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { diagnoses, patients, users } from '../../database/schema';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '@ncdss/shared';

const router = Router();

// ============================================================================
// Helper Functions
// ============================================================================

function isDoctorOrAdmin(role: string): boolean {
  return role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN;
}

// ============================================================================
// GET /diagnoses/patient/:patientId
// List all diagnoses for a patient
// ============================================================================

router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
    const db = getDb();

    // Verify patient exists
    const [patient] = await db.select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId));

    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Build query conditions
    const conditions = [eq(diagnoses.patientId, patientId)];
    if (status && typeof status === 'string') {
      conditions.push(eq(diagnoses.status, status.toUpperCase()));
    }

    // Get diagnoses with diagnoser info
    const result = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      updatedAt: diagnoses.updatedAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(diagnoses.diagnosedAt));

    res.json(result);
  } catch (error) {
    console.error('List diagnoses error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// GET /diagnoses/:id
// Get single diagnosis
// ============================================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [diagnosis] = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      updatedAt: diagnoses.updatedAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(eq(diagnoses.id, id));

    if (!diagnosis) {
      return res.status(404).json({ error: 'Diagnostic non trouvé' });
    }

    res.json(diagnosis);
  } catch (error) {
    console.error('Get diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /diagnoses
// Create new diagnosis (Doctor only)
// ============================================================================

router.post('/', async (req, res) => {
  try {
    const { userId, role } = (req as AuthRequest).user!;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent poser un diagnostic' });
    }

    const {
      patientId,
      diagnosisCode,
      diagnosisName,
      diagnosisType,
      severity,
      notes
    } = req.body;

    // Validation
    if (!patientId) {
      return res.status(400).json({ error: 'Patient requis' });
    }
    if (!diagnosisName || !diagnosisName.trim()) {
      return res.status(400).json({ error: 'Nom du diagnostic requis' });
    }
    if (!diagnosisType || !diagnosisType.trim()) {
      return res.status(400).json({ error: 'Type de diagnostic requis' });
    }

    // Validate diagnosis type
    const validTypes = ['PRIMARY', 'SECONDARY', 'DIFFERENTIAL'];
    if (!validTypes.includes(diagnosisType.toUpperCase())) {
      return res.status(400).json({
        error: 'Type de diagnostic invalide. Valeurs acceptées: PRIMARY, SECONDARY, DIFFERENTIAL'
      });
    }

    // Validate severity if provided
    const validSeverities = ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'];
    if (severity && !validSeverities.includes(severity.toUpperCase())) {
      return res.status(400).json({
        error: 'Sévérité invalide. Valeurs acceptées: MILD, MODERATE, SEVERE, CRITICAL'
      });
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

    await db.insert(diagnoses).values({
      id,
      patientId,
      diagnosisCode: diagnosisCode?.trim() || null,
      diagnosisName: diagnosisName.trim(),
      diagnosisType: diagnosisType.toUpperCase(),
      severity: severity?.toUpperCase() || null,
      notes: notes?.trim() || null,
      status: 'ACTIVE',
      diagnosedBy: userId,
      diagnosedAt: now,
      createdAt: now,
      updatedAt: now
    });

    // Return created diagnosis with diagnoser info
    const [created] = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(eq(diagnoses.id, id));

    res.status(201).json(created);
  } catch (error) {
    console.error('Create diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// PUT /diagnoses/:id
// Update diagnosis (Doctor only)
// ============================================================================

router.put('/:id', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent modifier un diagnostic' });
    }

    const { id } = req.params;
    const {
      diagnosisCode,
      diagnosisName,
      diagnosisType,
      severity,
      notes,
      status
    } = req.body;

    const db = getDb();

    // Get existing diagnosis
    const [existing] = await db.select()
      .from(diagnoses)
      .where(eq(diagnoses.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Diagnostic non trouvé' });
    }

    // Validate diagnosis type if provided
    const validTypes = ['PRIMARY', 'SECONDARY', 'DIFFERENTIAL'];
    if (diagnosisType && !validTypes.includes(diagnosisType.toUpperCase())) {
      return res.status(400).json({
        error: 'Type de diagnostic invalide. Valeurs acceptées: PRIMARY, SECONDARY, DIFFERENTIAL'
      });
    }

    // Validate severity if provided
    const validSeverities = ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'];
    if (severity && !validSeverities.includes(severity.toUpperCase())) {
      return res.status(400).json({
        error: 'Sévérité invalide. Valeurs acceptées: MILD, MODERATE, SEVERE, CRITICAL'
      });
    }

    // Validate status if provided
    const validStatuses = ['ACTIVE', 'RESOLVED', 'RULED_OUT'];
    if (status && !validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        error: 'Statut invalide. Valeurs acceptées: ACTIVE, RESOLVED, RULED_OUT'
      });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string | null> = {
      updatedAt: now
    };

    if (diagnosisCode !== undefined) {
      updateData.diagnosisCode = diagnosisCode?.trim() || null;
    }
    if (diagnosisName !== undefined) {
      if (!diagnosisName.trim()) {
        return res.status(400).json({ error: 'Nom du diagnostic requis' });
      }
      updateData.diagnosisName = diagnosisName.trim();
    }
    if (diagnosisType !== undefined) {
      updateData.diagnosisType = diagnosisType.toUpperCase();
    }
    if (severity !== undefined) {
      updateData.severity = severity?.toUpperCase() || null;
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }
    if (status !== undefined) {
      updateData.status = status.toUpperCase();
      // If status changed to RESOLVED, set resolvedAt
      if (status.toUpperCase() === 'RESOLVED' && existing.status !== 'RESOLVED') {
        updateData.resolvedAt = now;
      }
    }

    await db.update(diagnoses).set(updateData).where(eq(diagnoses.id, id));

    // Return updated diagnosis with diagnoser info
    const [updated] = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      updatedAt: diagnoses.updatedAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(eq(diagnoses.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Update diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /diagnoses/:id/confirm
// Confirm diagnosis (Doctor only)
// ============================================================================

router.post('/:id/confirm', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent confirmer un diagnostic' });
    }

    const { id } = req.params;
    const db = getDb();

    // Get diagnosis
    const [diagnosis] = await db.select()
      .from(diagnoses)
      .where(eq(diagnoses.id, id));

    if (!diagnosis) {
      return res.status(404).json({ error: 'Diagnostic non trouvé' });
    }

    // Check if already confirmed
    if (diagnosis.confirmedAt) {
      return res.status(400).json({ error: 'Diagnostic déjà confirmé' });
    }

    // Cannot confirm ruled out diagnosis
    if (diagnosis.status === 'RULED_OUT') {
      return res.status(400).json({ error: 'Impossible de confirmer un diagnostic écarté' });
    }

    const now = new Date().toISOString();

    await db.update(diagnoses).set({
      confirmedAt: now,
      updatedAt: now
    }).where(eq(diagnoses.id, id));

    // Return updated diagnosis with diagnoser info
    const [updated] = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      updatedAt: diagnoses.updatedAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(eq(diagnoses.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Confirm diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /diagnoses/:id/rule-out
// Rule out diagnosis (Doctor only)
// ============================================================================

router.post('/:id/rule-out', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent écarter un diagnostic' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Raison requise pour écarter le diagnostic' });
    }

    const db = getDb();

    // Get diagnosis
    const [diagnosis] = await db.select()
      .from(diagnoses)
      .where(eq(diagnoses.id, id));

    if (!diagnosis) {
      return res.status(404).json({ error: 'Diagnostic non trouvé' });
    }

    // Check if already ruled out
    if (diagnosis.status === 'RULED_OUT') {
      return res.status(400).json({ error: 'Diagnostic déjà écarté' });
    }

    const now = new Date().toISOString();

    await db.update(diagnoses).set({
      status: 'RULED_OUT',
      notes: reason.trim(),
      updatedAt: now
    }).where(eq(diagnoses.id, id));

    // Return updated diagnosis with diagnoser info
    const [updated] = await db.select({
      id: diagnoses.id,
      patientId: diagnoses.patientId,
      diagnosisCode: diagnoses.diagnosisCode,
      diagnosisName: diagnoses.diagnosisName,
      diagnosisType: diagnoses.diagnosisType,
      severity: diagnoses.severity,
      notes: diagnoses.notes,
      status: diagnoses.status,
      confirmedAt: diagnoses.confirmedAt,
      resolvedAt: diagnoses.resolvedAt,
      diagnosedBy: diagnoses.diagnosedBy,
      diagnosedAt: diagnoses.diagnosedAt,
      createdAt: diagnoses.createdAt,
      updatedAt: diagnoses.updatedAt,
      diagnoserName: users.fullName
    })
    .from(diagnoses)
    .leftJoin(users, eq(diagnoses.diagnosedBy, users.id))
    .where(eq(diagnoses.id, id));

    res.json(updated);
  } catch (error) {
    console.error('Rule out diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as diagnosesRouter };
