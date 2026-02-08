import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { prescriptions, patients, users } from '../../database/schema';
import { UserRole, AdministrationStatus } from '@ncdss/shared';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface Administration {
  id: string;
  time: string;
  nurseId: string;
  status: AdministrationStatus;
  notes?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseAdministrations(json: string | null): Administration[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function isDoctorOrAdmin(role: string): boolean {
  return role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN;
}

function canAdminister(role: string): boolean {
  return role === UserRole.NURSE || role === UserRole.NURSE_SUPERVISOR || role === UserRole.SUPER_ADMIN;
}

function canManagePrescriptionStatus(role: string): boolean {
  return role === UserRole.NURSE || role === UserRole.NURSE_SUPERVISOR ||
         role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN;
}

// ============================================================================
// GET /prescriptions/patient/:patientId
// List all prescriptions for a patient
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
    const conditions = [eq(prescriptions.patientId, patientId)];
    if (status && typeof status === 'string') {
      conditions.push(eq(prescriptions.status, status.toUpperCase()));
    }

    // Get prescriptions with prescriber info
    const result = await db.select({
      id: prescriptions.id,
      patientId: prescriptions.patientId,
      medicationName: prescriptions.medicationName,
      dosage: prescriptions.dosage,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      instructions: prescriptions.instructions,
      startTime: prescriptions.startTime,
      endTime: prescriptions.endTime,
      status: prescriptions.status,
      administrations: prescriptions.administrations,
      prescribedBy: prescriptions.prescribedBy,
      prescribedAt: prescriptions.prescribedAt,
      cancelledBy: prescriptions.cancelledBy,
      cancelledAt: prescriptions.cancelledAt,
      cancelReason: prescriptions.cancelReason,
      createdAt: prescriptions.createdAt,
      prescriberName: users.fullName
    })
    .from(prescriptions)
    .leftJoin(users, eq(prescriptions.prescribedBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(prescriptions.prescribedAt));

    // Parse administrations JSON
    const prescriptionsWithParsed = result.map((p: typeof result[number]) => ({
      ...p,
      administrations: parseAdministrations(p.administrations)
    }));

    res.json(prescriptionsWithParsed);
  } catch (error) {
    console.error('List prescriptions error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// GET /prescriptions/:id
// Get single prescription with parsed administrations
// ============================================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [prescription] = await db.select({
      id: prescriptions.id,
      patientId: prescriptions.patientId,
      medicationName: prescriptions.medicationName,
      dosage: prescriptions.dosage,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      instructions: prescriptions.instructions,
      startTime: prescriptions.startTime,
      endTime: prescriptions.endTime,
      status: prescriptions.status,
      administrations: prescriptions.administrations,
      prescribedBy: prescriptions.prescribedBy,
      prescribedAt: prescriptions.prescribedAt,
      cancelledBy: prescriptions.cancelledBy,
      cancelledAt: prescriptions.cancelledAt,
      cancelReason: prescriptions.cancelReason,
      createdAt: prescriptions.createdAt,
      updatedAt: prescriptions.updatedAt,
      prescriberName: users.fullName
    })
    .from(prescriptions)
    .leftJoin(users, eq(prescriptions.prescribedBy, users.id))
    .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    res.json({
      ...prescription,
      administrations: parseAdministrations(prescription.administrations)
    });
  } catch (error) {
    console.error('Get prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions
// Create new prescription (Doctor only)
// ============================================================================

router.post('/', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent prescrire' });
    }

    const {
      patientId,
      medicationName,
      dosage,
      route,
      frequency,
      duration,
      instructions,
      startTime
    } = req.body;

    // Validation
    if (!patientId) {
      return res.status(400).json({ error: 'Patient requis' });
    }
    if (!medicationName || !medicationName.trim()) {
      return res.status(400).json({ error: 'Nom du médicament requis' });
    }
    if (!dosage || !dosage.trim()) {
      return res.status(400).json({ error: 'Dosage requis' });
    }
    if (!route || !route.trim()) {
      return res.status(400).json({ error: 'Voie d\'administration requise' });
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

    await db.insert(prescriptions).values({
      id,
      patientId,
      medicationName: medicationName.trim(),
      dosage: dosage.trim(),
      route: route.trim().toUpperCase(),
      frequency: frequency?.trim() || null,
      duration: duration?.trim() || null,
      instructions: instructions?.trim() || null,
      startTime: startTime || now,
      status: 'ACTIVE',
      administrations: '[]',
      prescribedBy: userId,
      prescribedAt: now,
      createdAt: now,
      updatedAt: now
    });

    // Return created prescription with prescriber info
    const [created] = await db.select({
      id: prescriptions.id,
      patientId: prescriptions.patientId,
      medicationName: prescriptions.medicationName,
      dosage: prescriptions.dosage,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      instructions: prescriptions.instructions,
      startTime: prescriptions.startTime,
      endTime: prescriptions.endTime,
      status: prescriptions.status,
      administrations: prescriptions.administrations,
      prescribedBy: prescriptions.prescribedBy,
      prescribedAt: prescriptions.prescribedAt,
      createdAt: prescriptions.createdAt,
      prescriberName: users.fullName
    })
    .from(prescriptions)
    .leftJoin(users, eq(prescriptions.prescribedBy, users.id))
    .where(eq(prescriptions.id, id));

    res.status(201).json({
      ...created,
      administrations: []
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions/:id/administer
// Record administration (Nurse)
// ============================================================================

router.post('/:id/administer', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;
    const { id } = req.params;
    const { status, notes } = req.body;

    // Role check: Only nurses can administer medications
    if (!canAdminister(role)) {
      return res.status(403).json({ error: 'Seuls les infirmiers peuvent administrer les médicaments' });
    }

    // Validate status (accepts uppercase enum values from AdministrationStatus)
    const validStatuses = Object.values(AdministrationStatus);
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}`
      });
    }

    const db = getDb();

    // Get prescription
    const [prescription] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    // Verify prescription is active
    if (prescription.status !== 'ACTIVE') {
      return res.status(400).json({
        error: `Prescription non active (statut actuel: ${prescription.status})`
      });
    }

    // Parse existing administrations and add new one
    const existingAdmins = parseAdministrations(prescription.administrations);
    const newAdmin: Administration = {
      id: randomUUID(),
      time: new Date().toISOString(),
      nurseId: userId,
      status,
      notes: notes?.trim() || undefined
    };

    existingAdmins.push(newAdmin);

    // Update prescription
    await db.update(prescriptions).set({
      administrations: JSON.stringify(existingAdmins),
      updatedAt: new Date().toISOString()
    }).where(eq(prescriptions.id, id));

    res.json(newAdmin);
  } catch (error) {
    console.error('Administer prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions/:id/cancel
// Cancel prescription (Doctor only)
// ============================================================================

router.post('/:id/cancel', async (req, res) => {
  try {
    const { userId, role } = (req as any).user;

    // Role check: Doctor or Super Admin only
    if (!isDoctorOrAdmin(role)) {
      return res.status(403).json({ error: 'Seuls les médecins peuvent annuler une prescription' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Raison d\'annulation requise' });
    }

    const db = getDb();

    // Get prescription
    const [prescription] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    // Cannot cancel already cancelled or completed
    if (prescription.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Prescription déjà annulée' });
    }
    if (prescription.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Prescription déjà terminée' });
    }

    const now = new Date().toISOString();

    await db.update(prescriptions).set({
      status: 'CANCELLED',
      cancelledBy: userId,
      cancelledAt: now,
      cancelReason: reason.trim(),
      updatedAt: now
    }).where(eq(prescriptions.id, id));

    const [updated] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    res.json({
      ...updated,
      administrations: parseAdministrations(updated.administrations)
    });
  } catch (error) {
    console.error('Cancel prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions/:id/hold
// Put prescription on hold
// ============================================================================

router.post('/:id/hold', async (req, res) => {
  try {
    const { role } = (req as any).user;
    const { id } = req.params;

    // Role check: Nurses and doctors can put prescriptions on hold
    if (!canManagePrescriptionStatus(role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();

    // Get prescription
    const [prescription] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    // Can only hold active prescriptions
    if (prescription.status !== 'ACTIVE') {
      return res.status(400).json({
        error: `Impossible de suspendre. Statut actuel: ${prescription.status}`
      });
    }

    await db.update(prescriptions).set({
      status: 'ON_HOLD',
      updatedAt: new Date().toISOString()
    }).where(eq(prescriptions.id, id));

    const [updated] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    res.json({
      ...updated,
      administrations: parseAdministrations(updated.administrations)
    });
  } catch (error) {
    console.error('Hold prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions/:id/resume
// Resume prescription from hold
// ============================================================================

router.post('/:id/resume', async (req, res) => {
  try {
    const { role } = (req as any).user;
    const { id } = req.params;

    // Role check: Nurses and doctors can resume prescriptions
    if (!canManagePrescriptionStatus(role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();

    // Get prescription
    const [prescription] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    // Can only resume on-hold prescriptions
    if (prescription.status !== 'ON_HOLD') {
      return res.status(400).json({
        error: `Impossible de reprendre. Statut actuel: ${prescription.status}`
      });
    }

    await db.update(prescriptions).set({
      status: 'ACTIVE',
      updatedAt: new Date().toISOString()
    }).where(eq(prescriptions.id, id));

    const [updated] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    res.json({
      ...updated,
      administrations: parseAdministrations(updated.administrations)
    });
  } catch (error) {
    console.error('Resume prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /prescriptions/:id/complete
// Mark prescription as completed
// ============================================================================

router.post('/:id/complete', async (req, res) => {
  try {
    const { role } = (req as any).user;
    const { id } = req.params;

    // Role check: Nurses and doctors can complete prescriptions
    if (!canManagePrescriptionStatus(role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();

    // Get prescription
    const [prescription] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription non trouvée' });
    }

    // Can only complete active or on-hold prescriptions
    if (prescription.status !== 'ACTIVE' && prescription.status !== 'ON_HOLD') {
      return res.status(400).json({
        error: `Impossible de terminer. Statut actuel: ${prescription.status}`
      });
    }

    const now = new Date().toISOString();

    await db.update(prescriptions).set({
      status: 'COMPLETED',
      endTime: now,
      updatedAt: now
    }).where(eq(prescriptions.id, id));

    const [updated] = await db.select()
      .from(prescriptions)
      .where(eq(prescriptions.id, id));

    res.json({
      ...updated,
      administrations: parseAdministrations(updated.administrations)
    });
  } catch (error) {
    console.error('Complete prescription error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as prescriptionsRouter };
