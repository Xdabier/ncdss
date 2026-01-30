import { Router } from 'express';
import { eq, and, like, desc, gte, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { patients, users, presentingComplaints, boxes, weeklySchedule } from '../../database/schema';
import { PatientStatus, Orientation, OrientationSource } from '@ncdss/shared';
import { calculateNEWS, calculateGCS, calculateQSOFA } from '../../utils/scores';
import {
  extractAirwaySigns,
  extractBreathingSigns,
  extractCirculationSigns,
  extractDisabilitySigns,
  extractExposureSigns
} from '../../services/signExtractor';
import { matchFindingsToPathologies } from '../../services/pathologyMatcher';
import { getLLMProvider, PreDiagnosisContext } from '../../services/llm';
import * as aiPreDiagnosisService from '../../services/ai-prediagnosis-service';
import { getCurrentDoctorForBox } from './box-assignments';
import {
  notifyDoctorPatientAssigned,
  notifyTriageComplete
} from '../../services/notificationService';

const router = Router();

// ============================================================================ 
// LIST & SEARCH
// ============================================================================ 

// List patients with filters
router.get('/', async (req, res) => {
  try {
    const { status, search, today, limit = 50 } = req.query;
    const db = getDb();
    
    const queryBase = db.select({
      id: patients.id,
      fullName: patients.fullName,
      age: patients.age,
      sex: patients.sex,
      nationalId: patients.nationalId,
      chiefComplaint: patients.chiefComplaint,
      allergies: patients.allergies,
      status: patients.status,
      esiLevel: patients.esiLevel,
      finalOrientation: patients.finalOrientation,
      suggestedOrientation: patients.suggestedOrientation,
      newsScore: patients.newsScore,
      gcsScore: patients.gcsScore,
      qsofaScore: patients.qsofaScore,
      assignedDoctorId: patients.assignedDoctorId,
      assignedBoxId: patients.assignedBoxId,
      createdAt: patients.createdAt,
      triageCompletedAt: patients.triageCompletedAt,
      treatmentStartedAt: patients.treatmentStartedAt,
      doctorAssignedAt: patients.doctorAssignedAt
    })
    .from(patients);
    
    const conditions = [];

    // Handle status filter - supports single value or array
    if (status) {
      if (Array.isArray(status)) {
        // Multiple statuses: ?status=TRIAGED&status=IN_TREATMENT
        conditions.push(inArray(patients.status, status as string[]));
      } else {
        // Single status: ?status=TRIAGED
        conditions.push(eq(patients.status, status as string));
      }
    }

    if (search) {
      conditions.push(like(patients.fullName, `%${search}%`));
    }
    
    if (today === 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      conditions.push(gte(patients.createdAt, todayStart.toISOString()));
    }
    
    const queryWithWhere = conditions.length > 0 
      ? queryBase.where(and(...conditions))
      : queryBase;
    
    const result = await queryWithWhere
      .orderBy(desc(patients.createdAt))
      .limit(Number(limit));

    res.json(result);
  } catch (error) {
    console.error('List patients error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get single patient with full details
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const [patient] = await db.select()
      .from(patients)
      .where(eq(patients.id, req.params.id));
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }
    
    res.json(patient);
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================ 
// INSCRIPTION (Registration)
// ============================================================================ 

// Create new patient (Inscription nurse)
router.post('/', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const {
      fullName,
      age,
      sex,
      nationalId,
      phone,
      address,
      allergies,
      chronicConditions,
      currentMedications,
      chiefComplaint,
      symptomOnset
    } = req.body;
    
    // Validation
    if (!fullName || !age || !sex) {
      return res.status(400).json({ error: 'Nom, âge et sexe sont requis' });
    }
    
    if (age < 0 || age > 150) {
      return res.status(400).json({ error: 'Âge invalide' });
    }
    
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    
    await db.insert(patients).values({
      id,
      fullName,
      age,
      sex,
      nationalId,
      phone,
      address,
      allergies,
      chronicConditions: chronicConditions ? JSON.stringify(chronicConditions) : null,
      currentMedications: currentMedications ? JSON.stringify(currentMedications) : null,
      chiefComplaint,
      symptomOnset,
      status: PatientStatus.REGISTERED,
      registeredBy: userId,
      createdAt: now,
      updatedAt: now
    });
    
    const [newPatient] = await db.select().from(patients).where(eq(patients.id, id));
    res.status(201).json(newPatient);
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update patient registration data
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const [existing] = await db.select().from(patients).where(eq(patients.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }
    
    // Only allow editing if still REGISTERED
    if (existing.status !== PatientStatus.REGISTERED) {
      return res.status(400).json({ error: 'Patient déjà en cours de triage' });
    }
    
    const {
      fullName, age, sex, nationalId, phone, address,
      allergies, chronicConditions, currentMedications,
      chiefComplaint, symptomOnset
    } = req.body;
    
    await db.update(patients).set({
      fullName,
      age,
      sex,
      nationalId,
      phone,
      address,
      allergies,
      chronicConditions: chronicConditions ? JSON.stringify(chronicConditions) : null,
      currentMedications: currentMedications ? JSON.stringify(currentMedications) : null,
      chiefComplaint,
      symptomOnset,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));
    
    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================ 
// TRIAGE
// ============================================================================ 

// Start triage (changes status to IN_TRIAGE)
router.post('/:id/start-triage', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { id } = req.params;
    const db = getDb();
    
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }
    
    if (patient.status !== PatientStatus.REGISTERED) {
      return res.status(400).json({ error: 'Patient non disponible pour triage' });
    }
    
    await db.update(patients).set({
      status: PatientStatus.IN_TRIAGE,
      triageNurseId: userId,
      triageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));
    
    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Start triage error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update vitals
router.put('/:id/vitals', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }
    
    const {
      temperature, heartRate, respiratoryRate,
      systolicBP, diastolicBP, oxygenSaturation,
      painLevel, glucoseLevel, gcsEye, gcsVerbal, gcsMotor
    } = req.body;
    
    // Calculate scores
    const vitals = {
      temperature, heartRate, respiratoryRate,
      systolicBP, oxygenSaturation, gcsEye, gcsVerbal, gcsMotor
    };
    
    const newsScore = calculateNEWS(vitals);
    const gcsScore = calculateGCS(gcsEye, gcsVerbal, gcsMotor);
    const qsofaScore = calculateQSOFA(respiratoryRate, systolicBP, gcsScore);
    
    await db.update(patients).set({
      temperature, heartRate, respiratoryRate,
      systolicBP, diastolicBP, oxygenSaturation,
      painLevel, glucoseLevel, gcsEye, gcsVerbal, gcsMotor,
      newsScore, gcsScore, qsofaScore,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));
    
    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Update vitals error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update ABCDE assessment
router.put('/:id/abcde/:category', async (req, res) => {
  try {
    const { id, category } = req.params;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    const categoryFields: Record<string, string> = {
      'A': 'abcdeAirway',
      'B': 'abcdeBreathing',
      'C': 'abcdeCirculation',
      'D': 'abcdeDisability',
      'E': 'abcdeExposure'
    };

    const field = categoryFields[category.toUpperCase()];
    if (!field) {
      return res.status(400).json({ error: 'Catégorie ABCDE invalide' });
    }

    // Build update data starting with the JSON blob
    const updateData: Record<string, any> = {
      [field]: JSON.stringify(req.body),
      updatedAt: new Date().toISOString()
    };

    // Extract vitals from each ABCDE category to flat patient fields
    const cat = category.toUpperCase();
    const data = req.body;

    if (cat === 'A') {
      // Airway: painLevel
      if (data.painLevel !== undefined) updateData.painLevel = data.painLevel;
    } else if (cat === 'B') {
      // Breathing: respiratoryRate, oxygenSaturation
      if (data.respiratoryRate !== undefined) updateData.respiratoryRate = data.respiratoryRate;
      if (data.oxygenSaturation !== undefined) updateData.oxygenSaturation = data.oxygenSaturation;
    } else if (cat === 'C') {
      // Circulation: heartRate, bloodPressure (parse to systolic/diastolic)
      if (data.heartRate !== undefined) updateData.heartRate = data.heartRate;
      if (data.bloodPressure && typeof data.bloodPressure === 'string') {
        const parts = data.bloodPressure.split('/');
        if (parts.length === 2) {
          const systolic = parseInt(parts[0]);
          const diastolic = parseInt(parts[1]);
          if (!isNaN(systolic)) updateData.systolicBP = systolic;
          if (!isNaN(diastolic)) updateData.diastolicBP = diastolic;
        }
      }
    } else if (cat === 'D') {
      // Disability: GCS components, glucoseLevel
      if (data.gcsEye !== undefined) updateData.gcsEye = data.gcsEye;
      if (data.gcsVerbal !== undefined) updateData.gcsVerbal = data.gcsVerbal;
      if (data.gcsMotor !== undefined) updateData.gcsMotor = data.gcsMotor;
      if (data.glucoseLevel !== undefined) updateData.glucoseLevel = data.glucoseLevel;
    } else if (cat === 'E') {
      // Exposure: temperature
      if (data.temperature !== undefined) updateData.temperature = data.temperature;
    }

    // Apply this category's updates first
    await db.update(patients).set(updateData).where(eq(patients.id, id));

    // Fetch updated patient to recalculate scores with all current values
    const [updatedPatient] = await db.select().from(patients).where(eq(patients.id, id));

    // Calculate GCS first (needed for NEWS and qSOFA)
    const gcsScore = calculateGCS(
      updatedPatient.gcsEye || 4,
      updatedPatient.gcsVerbal || 5,
      updatedPatient.gcsMotor || 6
    );

    // Recalculate scores using all available vitals
    const vitals = {
      temperature: updatedPatient.temperature,
      heartRate: updatedPatient.heartRate,
      respiratoryRate: updatedPatient.respiratoryRate,
      systolicBP: updatedPatient.systolicBP,
      oxygenSaturation: updatedPatient.oxygenSaturation,
      gcsScore // Pass calculated GCS to NEWS
    };

    const newsScore = calculateNEWS(vitals);
    const qsofaScore = calculateQSOFA(
      updatedPatient.respiratoryRate,
      updatedPatient.systolicBP,
      gcsScore
    );

    // Update scores
    await db.update(patients).set({
      newsScore,
      gcsScore,
      qsofaScore
    }).where(eq(patients.id, id));

    const [finalPatient] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(finalPatient);
  } catch (error) {
    console.error('Update ABCDE error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// CLINICAL DECISION SUPPORT
// ============================================================================

// Analyze ABCDE findings and get suggestions
router.post('/:id/analyze-findings', async (req, res) => {
  try {
    const { id } = req.params;
    const { forceReanalyze } = req.body;
    const db = getDb();

    // Load patient
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Check if already analyzed (unless force reanalyze)
    if (patient.matchedPathologies && !forceReanalyze) {
      try {
        // Reconstruct the full AnalysisResult from stored fields
        const topMatches = JSON.parse(patient.matchedPathologies);
        const suggestedNursingInterventions = patient.suggestedNursingInterventions
          ? JSON.parse(patient.suggestedNursingInterventions)
          : [];
        const suggestedMedicalInterventions = patient.suggestedMedicalInterventions
          ? JSON.parse(patient.suggestedMedicalInterventions)
          : [];

        return res.json({
          topMatches,
          suggestedNursingInterventions,
          suggestedMedicalInterventions,
          suggestedOrientation: patient.suggestedOrientation || 'MEDICAL',
          orientationSource: patient.orientationSource || 'MANUAL',
          orientationReason: patient.orientationReason || '',
          criticalAlerts: [], // Not stored, would need re-analysis
          scores: {
            news: patient.newsScore,
            gcs: patient.gcsScore,
            qsofa: patient.qsofaScore,
            esi: patient.esiLevel
          },
          analysisTimestamp: patient.analysisTimestamp || new Date().toISOString(),
          extractedSignsCount: 0, // Not stored
          matchedPathologiesCount: Array.isArray(topMatches) ? topMatches.length : 0,
          patientId: patient.id,
          patientName: patient.fullName,
          chiefComplaint: patient.chiefComplaint,
          cached: true
        });
      } catch {
        // Invalid JSON, proceed with new analysis
      }
    }

    // Parse ABCDE observations
    const airway = patient.abcdeAirway ? JSON.parse(patient.abcdeAirway) : {};
    const breathing = patient.abcdeBreathing ? JSON.parse(patient.abcdeBreathing) : {};
    const circulation = patient.abcdeCirculation ? JSON.parse(patient.abcdeCirculation) : {};
    const disability = patient.abcdeDisability ? JSON.parse(patient.abcdeDisability) : {};
    const exposure = patient.abcdeExposure ? JSON.parse(patient.abcdeExposure) : {};

    // Extract clinical signs from observations
    const extractedSigns = [
      extractAirwaySigns(airway),
      extractBreathingSigns(breathing),
      extractCirculationSigns(circulation),
      extractDisabilitySigns(disability),
      extractExposureSigns(exposure)
    ];

    // Get current scores
    const scores = {
      news: patient.newsScore || undefined,
      gcs: patient.gcsScore || undefined,
      qsofa: patient.qsofaScore || undefined,
      esi: patient.esiLevel || undefined
    };

    // Run pathology matching
    const result = await matchFindingsToPathologies(
      extractedSigns,
      patient.chiefComplaint || undefined,
      patient.chiefComplaintId || undefined,
      scores
    );

    // Store results in patient record
    await db.update(patients).set({
      matchedPathologies: JSON.stringify(result.topMatches),
      suggestedNursingInterventions: JSON.stringify(result.suggestedNursingInterventions),
      suggestedMedicalInterventions: JSON.stringify(result.suggestedMedicalInterventions),
      suggestedOrientation: result.suggestedOrientation,
      orientationSource: result.orientationSource,
      orientationReason: result.orientationReason,
      analysisTimestamp: result.analysisTimestamp,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));

    // Return full result
    res.json({
      ...result,
      patientId: patient.id,
      patientName: patient.fullName,
      chiefComplaint: patient.chiefComplaint,
      cached: false
    });
  } catch (error) {
    console.error('Analyze findings error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get analysis results (read-only, doesn't re-analyze)
router.get('/:id/analysis', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Parse stored analysis results
    const matchedPathologies = patient.matchedPathologies
      ? JSON.parse(patient.matchedPathologies)
      : [];
    const suggestedNursingInterventions = patient.suggestedNursingInterventions
      ? JSON.parse(patient.suggestedNursingInterventions)
      : [];
    const suggestedMedicalInterventions = patient.suggestedMedicalInterventions
      ? JSON.parse(patient.suggestedMedicalInterventions)
      : [];

    res.json({
      patientId: patient.id,
      patientName: patient.fullName,
      chiefComplaint: patient.chiefComplaint,
      topMatches: matchedPathologies,
      suggestedNursingInterventions,
      suggestedMedicalInterventions,
      suggestedOrientation: patient.suggestedOrientation,
      orientationSource: patient.orientationSource,
      orientationReason: patient.orientationReason,
      analysisTimestamp: patient.analysisTimestamp,
      scores: {
        news: patient.newsScore,
        gcs: patient.gcsScore,
        qsofa: patient.qsofaScore,
        esi: patient.esiLevel
      },
      hasAnalysis: !!patient.matchedPathologies
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get orientation suggestion based on presenting complaint and scores
// Note: For full clinical decision support, use POST /:id/analyze-findings instead
router.get('/:id/suggest-orientation', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    let suggestion: Orientation = Orientation.MEDICAL;
    let source: OrientationSource = OrientationSource.MANUAL;
    let reason = '';

    // 1. Check if patient has stored analysis results
    if (patient.suggestedOrientation) {
      suggestion = patient.suggestedOrientation as Orientation;
      source = (patient.orientationSource as OrientationSource) || OrientationSource.MANUAL;
      reason = patient.orientationReason || '';
    }
    // 2. Check presenting complaint (motif de consultation)
    else if (patient.chiefComplaint) {
      const [complaint] = await db.select()
        .from(presentingComplaints)
        .where(like(presentingComplaints.name, `%${patient.chiefComplaint}%`))
        .limit(1);

      if (complaint) {
        if (!complaint.isMultiCategory) {
          suggestion = complaint.primaryOrientation as Orientation;
          source = OrientationSource.PATHOLOGY_LOOKUP;
          reason = `Motif: ${complaint.name} → ${complaint.category}`;
        } else {
          source = OrientationSource.SCORE_BASED;

          if ((patient.newsScore && patient.newsScore >= 7) ||
              (patient.esiLevel && patient.esiLevel <= 2) ||
              (patient.gcsScore && patient.gcsScore < 12) ||
              (patient.qsofaScore && patient.qsofaScore >= 2)) {
            suggestion = Orientation.SAUV;
            reason = 'Scores critiques détectés';
          } else {
            suggestion = complaint.primaryOrientation as Orientation;
            reason = `Motif multi-catégorie: ${complaint.category}`;
          }
        }
      }
    }

    // 3. Override with score-based rules if critical
    if (source !== OrientationSource.SCORE_BASED) {
      if ((patient.newsScore && patient.newsScore >= 7) ||
          (patient.gcsScore && patient.gcsScore < 9)) {
        suggestion = Orientation.SAUV;
        source = OrientationSource.SCORE_BASED;
        reason = 'Scores critiques (NEWS ≥7 ou GCS <9)';
      }
    }

    res.json({
      suggestion,
      source,
      reason,
      scores: {
        news: patient.newsScore,
        gcs: patient.gcsScore,
        qsofa: patient.qsofaScore,
        esi: patient.esiLevel
      }
    });
  } catch (error) {
    console.error('Suggest orientation error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update ESI level during triage
router.put('/:id/esi', async (req, res) => {
  try {
    const { id } = req.params;
    const { esiLevel } = req.body;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Allow ESI update during triage
    if (patient.status !== PatientStatus.IN_TRIAGE && patient.status !== PatientStatus.REGISTERED) {
      return res.status(400).json({ error: 'Patient n\'est pas en triage' });
    }

    // Validate ESI level
    if (!esiLevel || esiLevel < 1 || esiLevel > 5) {
      return res.status(400).json({ error: 'Niveau ESI invalide (1-5)' });
    }

    await db.update(patients).set({
      esiLevel,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Update ESI error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Complete triage
router.post('/:id/complete-triage', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = (req as any).user;
    const { esiLevel, suggestedOrientation, orientationSource, finalOrientation, overrideReason } = req.body;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    if (patient.status !== PatientStatus.IN_TRIAGE) {
      return res.status(400).json({ error: 'Patient n\'est pas en triage' });
    }

    // Validation
    if (!esiLevel || esiLevel < 1 || esiLevel > 5) {
      return res.status(400).json({ error: 'Niveau ESI requis (1-5)' });
    }

    if (!finalOrientation) {
      return res.status(400).json({ error: 'Orientation finale requise' });
    }

    const now = new Date().toISOString();

    await db.update(patients).set({
      esiLevel,
      suggestedOrientation: suggestedOrientation || finalOrientation,
      orientationSource: orientationSource || OrientationSource.MANUAL,
      finalOrientation,
      orientationOverrideReason: (suggestedOrientation && finalOrientation !== suggestedOrientation) ? overrideReason : null,
      status: PatientStatus.TRIAGED,
      triageCompletedAt: now,
      updatedAt: now
    }).where(eq(patients.id, id));

    // Trigger background AI pre-diagnosis generation if not already done
    const existingPreDiagnosis = await aiPreDiagnosisService.getByPatientId(id);
    if (!existingPreDiagnosis || existingPreDiagnosis.status === 'failed') {
      // Background generation - don't await, let it run in background
      aiPreDiagnosisService.triggerBackgroundGeneration(
        id,
        userId,
        'auto_triage_complete'
      );
    }

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));

    // Notify treatment nurses that triage is complete (fire-and-forget)
    try {
      const today = new Date();
      const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0..Sun=6
      const weekStart = getWeekStart(today);

      const treatmentNurses = await db
        .select({ nurseId: weeklySchedule.nurseId })
        .from(weeklySchedule)
        .where(
          and(
            eq(weeklySchedule.weekStart, weekStart),
            eq(weeklySchedule.dayOfWeek, dayOfWeek),
            eq(weeklySchedule.assignedRole, 'TREATMENT')
          )
        );

      if (treatmentNurses.length > 0) {
        notifyTriageComplete(
          treatmentNurses.map((n: typeof treatmentNurses[number]) => n.nurseId),
          id,
          patient.fullName,
          esiLevel,
          finalOrientation
        ).catch((err) => console.error('Notification error (triage complete):', err));
      }
    } catch (notifError) {
      console.error('Failed to send triage complete notification:', notifError);
    }

    res.json(updated);
  } catch (error) {
    console.error('Complete triage error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Helper to get the Monday date string for the current week
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

// Update patient status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, boxId, doctorId } = req.body;
    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (boxId) updateData.assignedBoxId = boxId;
    if (doctorId) updateData.assignedDoctorId = doctorId;

    await db.update(patients).set(updateData).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// TREATMENT WORKFLOW
// ============================================================================

// Start treatment - assign patient to box (auto-assigns doctor if one is currently assigned to the box)
router.post('/:id/start-treatment', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { id } = req.params;
    const { boxId } = req.body;

    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    if (patient.status !== PatientStatus.TRIAGED) {
      return res.status(400).json({ error: 'Patient doit être triagé pour commencer le traitement' });
    }

    // Validate box exists and is active
    let boxName: string | null = null;
    if (boxId) {
      const [box] = await db.select().from(boxes).where(eq(boxes.id, boxId));
      if (!box || !box.isActive) {
        return res.status(400).json({ error: 'Box invalide ou inactif' });
      }
      boxName = box.name;
    }

    // Auto-assign doctor: Look up the doctor currently assigned to this box
    let currentDoctor: { doctorId: string; doctorName: string } | null = null;
    if (boxId) {
      currentDoctor = await getCurrentDoctorForBox(boxId);
    }

    const now = new Date().toISOString();

    // Update patient with box and auto-assigned doctor
    await db.update(patients).set({
      status: currentDoctor ? PatientStatus.WITH_DOCTOR : PatientStatus.IN_TREATMENT,
      assignedBoxId: boxId || null,
      assignedDoctorId: currentDoctor?.doctorId || null,
      doctorAssignedAt: currentDoctor ? now : null,
      treatmentStartedAt: now,
      treatmentNurseId: userId,
      updatedAt: now
    }).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));

    // Notify the auto-assigned doctor (fire-and-forget)
    if (currentDoctor && boxName) {
      notifyDoctorPatientAssigned(
        currentDoctor.doctorId,
        id,
        patient.fullName,
        boxName,
        patient.esiLevel
      ).catch((err) => console.error('Notification error (doctor assigned):', err));
    }

    // Return complete info including auto-assigned doctor name
    res.json({
      ...updated,
      assignedBoxName: boxName,
      assignedDoctorName: currentDoctor?.doctorName || null,
      autoAssigned: !!currentDoctor
    });
  } catch (error) {
    console.error('Start treatment error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Add treatment note
router.post('/:id/notes', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { id } = req.params;
    const { note, noteType } = req.body;
    // noteType: 'observation' | 'intervention' | 'medication' | 'alert'

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note requise' });
    }

    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Parse existing notes or create new array
    const existingNotes = patient.treatmentNotes ? JSON.parse(patient.treatmentNotes) : [];

    const newNote = {
      id: Date.now().toString(),
      type: noteType || 'observation',
      content: note.trim(),
      authorId: userId,
      createdAt: new Date().toISOString()
    };

    existingNotes.push(newNote);

    await db.update(patients).set({
      treatmentNotes: JSON.stringify(existingNotes),
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));

    res.json(newNote);
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Request re-triage
router.post('/:id/request-retriage', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Raison requise pour la demande de re-triage' });
    }

    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    if (patient.status !== PatientStatus.IN_TREATMENT && patient.status !== PatientStatus.WITH_DOCTOR) {
      return res.status(400).json({ error: 'Patient doit être en traitement pour demander un re-triage' });
    }

    // Add re-triage request to notes
    const existingNotes = patient.treatmentNotes ? JSON.parse(patient.treatmentNotes) : [];
    existingNotes.push({
      id: Date.now().toString(),
      type: 'retriage_request',
      content: reason.trim(),
      authorId: userId,
      createdAt: new Date().toISOString()
    });

    await db.update(patients).set({
      status: PatientStatus.REGISTERED, // Back to triage queue
      retriageRequested: true,
      retriageReason: reason.trim(),
      treatmentNotes: JSON.stringify(existingNotes),
      // Clear triage data for re-assessment
      triageStartedAt: null,
      triageCompletedAt: null,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Request retriage error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Transfer to doctor
router.post('/:id/transfer-to-doctor', async (req, res) => {
  try {
    const { id } = req.params;
    const { doctorId, reason } = req.body;

    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Allow transfer for:
    // - IN_TREATMENT patients (initial doctor assignment)
    // - WITH_DOCTOR patients (re-transfer between doctors)
    const canTransfer = patient.status === PatientStatus.IN_TREATMENT ||
      patient.status === PatientStatus.WITH_DOCTOR;

    if (!canTransfer) {
      return res.status(400).json({ error: 'Patient doit être en soins infirmiers ou avec un médecin' });
    }

    // Validate doctor exists if provided
    if (doctorId) {
      const [doctor] = await db.select().from(users).where(eq(users.id, doctorId));
      if (!doctor) {
        return res.status(400).json({ error: 'Médecin non trouvé' });
      }

      // Check not transferring to same doctor
      if (patient.assignedDoctorId === doctorId) {
        return res.status(400).json({ error: 'Patient déjà assigné à ce médecin' });
      }
    }

    // Build transfer note
    const now = new Date();
    const transferNote = `[Transfert] ${now.toLocaleString('fr-FR')}: ${reason || 'Pas de raison spécifiée'}`;
    const updatedNotes = patient.treatmentNotes
      ? `${patient.treatmentNotes}\n\n${transferNote}`
      : transferNote;

    await db.update(patients).set({
      status: PatientStatus.WITH_DOCTOR,
      assignedDoctorId: doctorId || null,
      doctorAssignedAt: now.toISOString(),
      treatmentNotes: updatedNotes,
      updatedAt: now.toISOString()
    }).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Transfer to doctor error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Discharge patient
router.post('/:id/discharge', async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { id } = req.params;
    const { dischargeNotes, dischargeType } = req.body;
    // dischargeType: 'home' | 'admission' | 'transfer' | 'left_ama' | 'deceased'

    const validDischargeTypes = ['home', 'admission', 'transfer', 'left_ama', 'deceased'];
    const finalDischargeType = dischargeType && validDischargeTypes.includes(dischargeType)
      ? dischargeType
      : 'home';

    const db = getDb();

    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Allow discharge from IN_TREATMENT or WITH_DOCTOR status
    if (patient.status !== PatientStatus.IN_TREATMENT && patient.status !== PatientStatus.WITH_DOCTOR) {
      return res.status(400).json({ error: 'Patient doit être en soins pour être sorti' });
    }

    await db.update(patients).set({
      status: PatientStatus.DISCHARGED,
      dischargedAt: new Date().toISOString(),
      dischargedBy: userId,
      dischargeNotes: dischargeNotes || null,
      dischargeType: finalDischargeType,
      updatedAt: new Date().toISOString()
    }).where(eq(patients.id, id));

    const [updated] = await db.select().from(patients).where(eq(patients.id, id));
    res.json(updated);
  } catch (error) {
    console.error('Discharge error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// AI PRE-DIAGNOSIS (LLM Integration)
// ============================================================================

// Get saved AI pre-diagnosis
router.get('/:id/ai-prediagnosis', async (req, res) => {
  try {
    const { id } = req.params;

    const saved = await aiPreDiagnosisService.getByPatientId(id);

    if (!saved) {
      return res.json({ exists: false, status: null, result: null });
    }

    res.json({
      exists: true,
      status: saved.status,
      result: saved.status === 'completed' ? {
        suggestions: JSON.parse(saved.suggestions || '[]'),
        recommendedTests: JSON.parse(saved.recommendedTests || '[]'),
        warnings: JSON.parse(saved.warnings || '[]'),
        thinkingTrace: saved.thinkingTrace,
        thinkingEnabled: saved.thinkingEnabled,
        generatedAt: saved.generatedAt,
        available: true
      } : null,
      errorMessage: saved.status === 'failed' ? saved.errorMessage : null,
      generatedAt: saved.generatedAt,
      triggerSource: saved.triggerSource
    });
  } catch (error) {
    console.error('Get AI pre-diagnosis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Check AI service availability
router.get('/:id/ai-status', async (req, res) => {
  try {
    const llm = getLLMProvider();
    const available = await llm.isAvailable();
    res.json({ available, provider: 'llamacpp-local' });
  } catch (error) {
    console.error('AI status check error:', error);
    res.json({ available: false, provider: 'llamacpp-local' });
  }
});

// Generate AI pre-diagnosis suggestions
router.post('/:id/ai-prediagnosis', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = (req as any).user;
    const db = getDb();

    // Load patient
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      return res.status(404).json({ error: 'Patient non trouvé' });
    }

    // Determine trigger source based on role
    const triggerSource: aiPreDiagnosisService.AITriggerSource =
      role === 'DOCTOR' ? 'manual_doctor' : 'manual_nurse';

    // Set status to 'generating'
    await aiPreDiagnosisService.createOrUpdate(id, userId, triggerSource);

    // Get LLM provider
    const llm = getLLMProvider();

    // Build context from patient data
    const context: PreDiagnosisContext = {
      chiefComplaint: patient.chiefComplaint || '',
      age: patient.age,
      sex: patient.sex,
      vitals: {
        temperature: patient.temperature ?? undefined,
        heartRate: patient.heartRate ?? undefined,
        respiratoryRate: patient.respiratoryRate ?? undefined,
        bloodPressure: patient.systolicBP && patient.diastolicBP
          ? `${patient.systolicBP}/${patient.diastolicBP}`
          : undefined,
        oxygenSaturation: patient.oxygenSaturation ?? undefined
      },
      abcdeFindings: {
        airway: patient.abcdeAirway ? JSON.parse(patient.abcdeAirway) : undefined,
        breathing: patient.abcdeBreathing ? JSON.parse(patient.abcdeBreathing) : undefined,
        circulation: patient.abcdeCirculation ? JSON.parse(patient.abcdeCirculation) : undefined,
        disability: patient.abcdeDisability ? JSON.parse(patient.abcdeDisability) : undefined,
        exposure: patient.abcdeExposure ? JSON.parse(patient.abcdeExposure) : undefined
      },
      scores: {
        news: patient.newsScore ?? undefined,
        gcs: patient.gcsScore ?? undefined,
        qsofa: patient.qsofaScore ?? undefined
      },
      medicalHistory: patient.chronicConditions
        ? patient.chronicConditions.split(',').map((s: string) => s.trim())
        : undefined,
      allergies: patient.allergies ?? undefined
    };

    // Generate pre-diagnosis
    const suggestion = await llm.generatePreDiagnosis(context);

    // Save the result to database
    await aiPreDiagnosisService.saveResult(id, suggestion);

    res.json(suggestion);
  } catch (error: any) {
    const { id } = req.params;
    console.error('AI pre-diagnosis error:', error);
    // Update status to failed
    await aiPreDiagnosisService.updateStatus(id, 'failed', error.message || 'Erreur du service d\'IA');
    res.status(500).json({ error: 'Erreur du service d\'IA' });
  }
});

// Generate AI pre-diagnosis with streaming (SSE)
router.get('/:id/ai-prediagnosis-stream', async (req, res) => {
  const { id } = req.params;
  const { userId, role } = (req as any).user;

  try {
    const db = getDb();

    // Load patient
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    if (!patient) {
      res.status(404).json({ error: 'Patient non trouvé' });
      return;
    }

    // Determine trigger source based on role
    const triggerSource: aiPreDiagnosisService.AITriggerSource =
      role === 'DOCTOR' ? 'manual_doctor' : 'manual_nurse';

    // Set status to 'generating'
    await aiPreDiagnosisService.createOrUpdate(id, userId, triggerSource);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Get LLM provider
    const llm = getLLMProvider();

    // Build context from patient data
    const context: PreDiagnosisContext = {
      chiefComplaint: patient.chiefComplaint || '',
      age: patient.age,
      sex: patient.sex,
      vitals: {
        temperature: patient.temperature ?? undefined,
        heartRate: patient.heartRate ?? undefined,
        respiratoryRate: patient.respiratoryRate ?? undefined,
        bloodPressure: patient.systolicBP && patient.diastolicBP
          ? `${patient.systolicBP}/${patient.diastolicBP}`
          : undefined,
        oxygenSaturation: patient.oxygenSaturation ?? undefined
      },
      abcdeFindings: {
        airway: patient.abcdeAirway ? JSON.parse(patient.abcdeAirway) : undefined,
        breathing: patient.abcdeBreathing ? JSON.parse(patient.abcdeBreathing) : undefined,
        circulation: patient.abcdeCirculation ? JSON.parse(patient.abcdeCirculation) : undefined,
        disability: patient.abcdeDisability ? JSON.parse(patient.abcdeDisability) : undefined,
        exposure: patient.abcdeExposure ? JSON.parse(patient.abcdeExposure) : undefined
      },
      scores: {
        news: patient.newsScore ?? undefined,
        gcs: patient.gcsScore ?? undefined,
        qsofa: patient.qsofaScore ?? undefined
      },
      medicalHistory: patient.chronicConditions
        ? patient.chronicConditions.split(',').map((s: string) => s.trim())
        : undefined,
      allergies: patient.allergies ?? undefined
    };

    // Stream pre-diagnosis generation and save result when done
    await llm.generatePreDiagnosisStream(context, async (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);

      // Save result to database when generation completes
      if (chunk.type === 'done' && chunk.result) {
        try {
          await aiPreDiagnosisService.saveResult(id, chunk.result);
        } catch (saveError) {
          console.error('Failed to save AI pre-diagnosis result:', saveError);
        }
      }

      // Update status to failed on error
      if (chunk.type === 'error') {
        try {
          await aiPreDiagnosisService.updateStatus(id, 'failed', chunk.error || 'Erreur inconnue');
        } catch (updateError) {
          console.error('Failed to update AI pre-diagnosis status:', updateError);
        }
      }
    });

    res.end();
  } catch (error: any) {
    console.error('AI pre-diagnosis stream error:', error);
    // Update status to failed
    try {
      await aiPreDiagnosisService.updateStatus(id, 'failed', error.message || 'Erreur du service d\'IA');
    } catch (updateError) {
      console.error('Failed to update AI pre-diagnosis status:', updateError);
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Erreur du service d\'IA' })}\n\n`);
    res.end();
  }
});

export { router as patientsRouter };
