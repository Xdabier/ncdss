import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Heart,
  Brain,
  Thermometer,
  ClipboardList,
  FileText,
  Save,
  Loader2,
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { VitalsForm, VitalsData } from '../../../components/abcde/VitalsForm';
import { AirwayForm } from '../../../components/abcde/AirwayForm';
import { BreathingForm } from '../../../components/abcde/BreathingForm';
import { CirculationForm } from '../../../components/abcde/CirculationForm';
import { DisabilityForm } from '../../../components/abcde/DisabilityForm';
import { ExposureForm } from '../../../components/abcde/ExposureForm';
import { MedicalHistoryForm, MedicalHistoryData } from '../../../components/abcde/MedicalHistoryForm';
import { TriageAccordion } from '../../../components/triage/TriageAccordion';
import { TriageAccordionSection } from '../../../components/triage/TriageAccordionSection';
import { ScoreBar } from '../../../components/triage/ScoreBar';
import { DecisionPanel, OrientationSuggestion } from '../../../components/triage/DecisionPanel';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, Orientation as OrientationType, OrientationSource, API_ROUTES } from '@ncdss/shared';
import type { ClinicalAnalysisResult } from '@ncdss/shared';
import { suggestESI } from '../../../utils/scoreUtils';

// ---------------------------------------------------------------------------
// Critical findings helpers
// ---------------------------------------------------------------------------

function hasCriticalVitals(vitals: Record<string, any>): boolean {
  return !!(
    (vitals.temperature != null && (vitals.temperature < 35 || vitals.temperature > 39)) ||
    (vitals.heartRate != null && (vitals.heartRate < 50 || vitals.heartRate > 120)) ||
    (vitals.respiratoryRate != null && (vitals.respiratoryRate < 8 || vitals.respiratoryRate > 30)) ||
    (vitals.oxygenSaturation != null && vitals.oxygenSaturation < 90) ||
    (vitals.systolicBP != null && (vitals.systolicBP < 90 || vitals.systolicBP > 180))
  );
}

function hasCriticalABCDE(abcde: Record<string, any>, vitals: Record<string, any>): boolean {
  const A = abcde.A || {};
  const B = abcde.B || {};
  const C = abcde.C || {};
  const D = abcde.D || {};
  const E = abcde.E || {};

  const gcs = (vitals.gcsEye || 0) + (vitals.gcsVerbal || 0) + (vitals.gcsMotor || 0);

  return !!(
    A.obstructed || A.stridor ||
    B.cyanosis || B.breathSounds === 'absent' || B.workOfBreathing === 'severe' ||
    C.bleeding || C.skinColor === 'mottled' || C.skinColor === 'cyanotic' || C.peripheralPulses === 'absent' ||
    D.seizures || D.pupils === 'unequal' || D.pupils === 'fixed' || D.motorResponse === 'paralysis' || D.motorResponse === 'lateralized' ||
    (gcs > 0 && gcs <= 8) ||
    E.burns
  );
}

function countFilledFields(data: Record<string, any>): number {
  return Object.values(data).filter(
    (v) => v !== undefined && v !== null && v !== '' && v !== false
  ).length;
}

function countTotalFields(sectionId: string): number {
  switch (sectionId) {
    case 'signes-vitaux': return 11; // vitals fields
    case 'voies-neuro': return 10; // A + D fields
    case 'etat-general': return 8; // E fields
    case 'antecedents': return 5; // history fields
    case 'notes': return 1;
    default: return 1;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TriageWorkflow(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form data
  const [medicalHistoryData, setMedicalHistoryData] = useState<Partial<MedicalHistoryData>>({});
  const [vitalsData, setVitalsData] = useState<Partial<VitalsData>>({});
  const [abcdeData, setAbcdeData] = useState<Record<string, any>>({
    A: {}, B: {}, C: {}, D: {}, E: {},
  });

  // Unified notes (stored in abcdeData.E.notes)
  const [triageNotes, setTriageNotes] = useState('');

  // Decision state (from TriageComplete)
  const [analysis, setAnalysis] = useState<ClinicalAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedESI, setSuggestedESI] = useState<number | null>(null);
  const [selectedESI, setSelectedESI] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<OrientationSuggestion | null>(null);
  const [selectedOrientation, setSelectedOrientation] = useState<OrientationType | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Per-section dirty tracking
  const dirtyRef = useRef<Record<string, boolean>>({
    'signes-vitaux': false,
    'voies-neuro': false,
    'etat-general': false,
    'antecedents': false,
    'notes': false,
  });

  // Analysis debounce
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save interval
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Patient loading
  // -----------------------------------------------------------------------

  const loadPatient = useCallback(async () => {
    if (!id) return;
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.byId(id));
      const p: Patient = response.data;
      setPatient(p);

      // Initialise medical history
      let parsedChronicConditions: string[] = [];
      let parsedCurrentMedications: string[] = [];
      try {
        parsedChronicConditions = p.chronicConditions ? JSON.parse(p.chronicConditions) : [];
      } catch { /* ignore */ }
      try {
        parsedCurrentMedications = p.currentMedications ? JSON.parse(p.currentMedications) : [];
      } catch { /* ignore */ }

      setMedicalHistoryData({
        chiefComplaint: p.chiefComplaint ?? undefined,
        symptomOnset: p.symptomOnset ?? undefined,
        allergies: p.allergies ?? undefined,
        chronicConditions: parsedChronicConditions,
        currentMedications: parsedCurrentMedications,
      });

      // Initialise vitals from flat fields
      setVitalsData({
        temperature: p.temperature ?? undefined,
        heartRate: p.heartRate ?? undefined,
        respiratoryRate: p.respiratoryRate ?? undefined,
        systolicBP: p.systolicBP ?? undefined,
        diastolicBP: p.diastolicBP ?? undefined,
        oxygenSaturation: p.oxygenSaturation ?? undefined,
        painLevel: p.painLevel ?? undefined,
        glucoseLevel: p.glucoseLevel ?? undefined,
        gcsEye: p.gcsEye ?? undefined,
        gcsVerbal: p.gcsVerbal ?? undefined,
        gcsMotor: p.gcsMotor ?? undefined,
      });

      // Initialise ABCDE from JSON blobs
      const parsedAbcde = {
        A: p.abcdeAirway ? JSON.parse(p.abcdeAirway as string) : {},
        B: p.abcdeBreathing ? JSON.parse(p.abcdeBreathing as string) : {},
        C: p.abcdeCirculation ? JSON.parse(p.abcdeCirculation as string) : {},
        D: p.abcdeDisability ? JSON.parse(p.abcdeDisability as string) : {},
        E: p.abcdeExposure ? JSON.parse(p.abcdeExposure as string) : {},
      };
      setAbcdeData(parsedAbcde);

      // Load unified notes from E.notes
      setTriageNotes(parsedAbcde.E?.notes || '');

      // Load ESI and orientation
      setSelectedESI(p.esiLevel ?? null);

      // Load orientation suggestion
      try {
        const suggestionRes = await api.get(API_ROUTES.patients.suggestOrientation(id));
        const suggestionData: OrientationSuggestion = suggestionRes.data;
        setSuggestion(suggestionData);
        if (!p.finalOrientation) {
          setSelectedOrientation(suggestionData.suggestion);
        } else {
          setSelectedOrientation(p.finalOrientation as OrientationType);
        }
      } catch {
        // Non-critical
      }

      // Compute suggested ESI
      const esi = suggestESI({
        newsScore: p.newsScore ?? undefined,
        gcsScore: p.gcsScore ?? undefined,
        qsofaScore: p.qsofaScore ?? undefined,
        painLevel: p.painLevel ?? undefined,
      });
      setSuggestedESI(esi);
      if (!p.esiLevel) {
        setSelectedESI(esi);
      }

      // Auto-run analysis if patient has ABCDE data
      const hasABCDEData = !!(p.abcdeAirway || p.abcdeBreathing || p.abcdeCirculation || p.abcdeDisability || p.abcdeExposure);
      if (hasABCDEData) {
        runAnalysis();
      }

      // Reset dirty tracking
      Object.keys(dirtyRef.current).forEach(k => { dirtyRef.current[k] = false; });
    } catch {
      setError('Erreur de chargement du patient');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // Auto-save interval
  useEffect(() => {
    autoSaveIntervalRef.current = setInterval(() => {
      saveAllDirty();
    }, 60000); // Every 60 seconds

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [id, medicalHistoryData, vitalsData, abcdeData, triageNotes]);

  // -----------------------------------------------------------------------
  // Analysis
  // -----------------------------------------------------------------------

  const runAnalysis = useCallback(async (force = false) => {
    if (!id) return;
    try {
      setAnalyzing(true);
      const api = await getApi();
      const analysisResponse = await api.post(API_ROUTES.patients.analyzeFindings(id), { forceReanalyze: force });
      setAnalysis(analysisResponse.data);

      // Update orientation suggestion from analysis
      if (analysisResponse.data.suggestedOrientation) {
        const newSuggestion: OrientationSuggestion = {
          suggestion: analysisResponse.data.suggestedOrientation as OrientationType,
          source: analysisResponse.data.orientationSource || OrientationSource.PATHOLOGY_LOOKUP,
          reason: analysisResponse.data.orientationReason || '',
          scores: {},
        };
        setSuggestion(newSuggestion);
      }
    } catch (e: any) {
      console.error('Analysis error:', e);
    } finally {
      setAnalyzing(false);
    }
  }, [id]);

  const debouncedRunAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current);
    }
    analysisTimerRef.current = setTimeout(() => {
      runAnalysis(true);
    }, 2000);
  }, [runAnalysis]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Save helpers
  // -----------------------------------------------------------------------

  const saveSection = useCallback(
    async (sectionId: string): Promise<boolean> => {
      if (!id) return false;

      try {
        const api = await getApi();

        switch (sectionId) {
          case 'signes-vitaux': {
            // Save vitals + breathing observations + circulation observations in parallel
            const vitals: Record<string, number | undefined> = {};
            if (vitalsData.temperature != null) vitals.temperature = vitalsData.temperature;
            if (vitalsData.heartRate != null) vitals.heartRate = vitalsData.heartRate;
            if (vitalsData.respiratoryRate != null) vitals.respiratoryRate = vitalsData.respiratoryRate;
            if (vitalsData.systolicBP != null) vitals.systolicBP = vitalsData.systolicBP;
            if (vitalsData.diastolicBP != null) vitals.diastolicBP = vitalsData.diastolicBP;
            if (vitalsData.oxygenSaturation != null) vitals.oxygenSaturation = vitalsData.oxygenSaturation;
            if (vitalsData.painLevel != null) vitals.painLevel = vitalsData.painLevel;
            if (vitalsData.glucoseLevel != null) vitals.glucoseLevel = vitalsData.glucoseLevel;
            if (vitalsData.gcsEye != null) vitals.gcsEye = vitalsData.gcsEye;
            if (vitalsData.gcsVerbal != null) vitals.gcsVerbal = vitalsData.gcsVerbal;
            if (vitalsData.gcsMotor != null) vitals.gcsMotor = vitalsData.gcsMotor;

            const results = await Promise.all([
              api.put(API_ROUTES.patients.vitals(id), vitals),
              api.put(API_ROUTES.patients.abcde(id, 'B'), abcdeData.B),
              api.put(API_ROUTES.patients.abcde(id, 'C'), abcdeData.C),
            ]);
            setPatient(results[0].data);

            // Update ESI suggestion after vitals save
            const updatedPatient = results[0].data;
            const esi = suggestESI({
              newsScore: updatedPatient.newsScore ?? undefined,
              gcsScore: updatedPatient.gcsScore ?? undefined,
              qsofaScore: updatedPatient.qsofaScore ?? undefined,
              painLevel: updatedPatient.painLevel ?? undefined,
            });
            setSuggestedESI(esi);
            break;
          }
          case 'voies-neuro': {
            const results = await Promise.all([
              api.put(API_ROUTES.patients.abcde(id, 'A'), abcdeData.A),
              api.put(API_ROUTES.patients.abcde(id, 'D'), abcdeData.D),
            ]);
            setPatient(results[0].data);
            break;
          }
          case 'etat-general': {
            // Save E data with notes merged in
            const eDataWithNotes = { ...abcdeData.E, notes: triageNotes };
            const response = await api.put(API_ROUTES.patients.abcde(id, 'E'), eDataWithNotes);
            setPatient(response.data);
            break;
          }
          case 'antecedents': {
            const response = await api.put(API_ROUTES.patients.medicalHistory(id), {
              chiefComplaint: medicalHistoryData.chiefComplaint,
              symptomOnset: medicalHistoryData.symptomOnset,
              allergies: medicalHistoryData.allergies,
              chronicConditions: medicalHistoryData.chronicConditions,
              currentMedications: medicalHistoryData.currentMedications,
            });
            setPatient(response.data);
            break;
          }
          case 'notes': {
            // Save notes in E data
            const eDataWithNotes = { ...abcdeData.E, notes: triageNotes };
            const response = await api.put(API_ROUTES.patients.abcde(id, 'E'), eDataWithNotes);
            setPatient(response.data);
            break;
          }
        }

        dirtyRef.current[sectionId] = false;
        return true;
      } catch (e: any) {
        console.error(`Save error for ${sectionId}:`, e);
        return false;
      }
    },
    [id, medicalHistoryData, vitalsData, abcdeData, triageNotes],
  );

  const saveAllDirty = useCallback(async () => {
    const dirtyKeys = Object.entries(dirtyRef.current)
      .filter(([, dirty]) => dirty)
      .map(([key]) => key);

    if (dirtyKeys.length === 0) return;

    setSaving(true);
    try {
      await Promise.all(dirtyKeys.map(key => saveSection(key)));
      debouncedRunAnalysis();
    } finally {
      setSaving(false);
    }
  }, [saveSection, debouncedRunAnalysis]);

  // -----------------------------------------------------------------------
  // Accordion collapse handler (auto-save)
  // -----------------------------------------------------------------------

  const handleSectionCollapse = useCallback(async (sectionId: string) => {
    if (dirtyRef.current[sectionId]) {
      setSaving(true);
      try {
        const saved = await saveSection(sectionId);
        if (saved) {
          debouncedRunAnalysis();
        }
      } finally {
        setSaving(false);
      }
    }
  }, [saveSection, debouncedRunAnalysis]);

  // -----------------------------------------------------------------------
  // Form change handlers (mark dirty)
  // -----------------------------------------------------------------------

  const handleHistoryChange = useCallback((data: Partial<MedicalHistoryData>) => {
    setMedicalHistoryData(data);
    dirtyRef.current['antecedents'] = true;
  }, []);

  const handleVitalsChange = useCallback((data: Partial<VitalsData>) => {
    setVitalsData(data);
    dirtyRef.current['signes-vitaux'] = true;
  }, []);

  const handleAbcdeChange = useCallback(
    (category: string, data: any) => {
      setAbcdeData((prev) => ({ ...prev, [category]: data }));
      // Map category to section
      if (category === 'B' || category === 'C') {
        dirtyRef.current['signes-vitaux'] = true;
      } else if (category === 'A' || category === 'D') {
        dirtyRef.current['voies-neuro'] = true;
      } else if (category === 'E') {
        dirtyRef.current['etat-general'] = true;
      }
    },
    [],
  );

  const handleNotesChange = useCallback((notes: string) => {
    setTriageNotes(notes);
    dirtyRef.current['notes'] = true;
  }, []);

  // -----------------------------------------------------------------------
  // Manual save
  // -----------------------------------------------------------------------

  const handleManualSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAllDirty();
      setSuccessMsg('Donnees enregistrees');
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch {
      setError('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }, [saveAllDirty]);

  // -----------------------------------------------------------------------
  // Complete triage
  // -----------------------------------------------------------------------

  const isOrientationOverride =
    selectedOrientation !== null &&
    suggestion !== null &&
    selectedOrientation !== suggestion.suggestion;

  const canConfirm =
    selectedESI !== null &&
    selectedOrientation !== null &&
    (!isOrientationOverride || overrideReason.trim().length > 0);

  const handleComplete = useCallback(async () => {
    if (!selectedESI || !selectedOrientation || !id) return;

    if (isOrientationOverride && !overrideReason.trim()) {
      setError("Veuillez indiquer la raison du changement d'orientation");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save all dirty sections first
      await saveAllDirty();

      const api = await getApi();

      // Set ESI
      await api.put(API_ROUTES.patients.esi(id), { esiLevel: selectedESI });

      // Complete triage
      await api.post(API_ROUTES.patients.completeTriage(id), {
        esiLevel: selectedESI,
        suggestedOrientation: suggestion?.suggestion,
        orientationSource: suggestion?.source,
        finalOrientation: selectedOrientation,
        overrideReason: isOrientationOverride ? overrideReason : null,
      });

      navigate(CLIENT_ROUTES.nurse.triage.queue, {
        state: { message: `Triage termine avec succes pour ${patient?.fullName}` },
      });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de la finalisation du triage');
    } finally {
      setSaving(false);
    }
  }, [
    id, selectedESI, selectedOrientation, isOrientationOverride, overrideReason,
    suggestion, patient, navigate, saveAllDirty,
  ]);

  // -----------------------------------------------------------------------
  // Section status summaries
  // -----------------------------------------------------------------------

  const getSectionStatus = useCallback((sectionId: string): React.ReactNode => {
    switch (sectionId) {
      case 'signes-vitaux': {
        const filled = countFilledFields(vitalsData);
        const critical = hasCriticalVitals(vitalsData as Record<string, any>);
        if (critical) return <span className="text-red-600 font-medium text-xs">⚠ Critiques</span>;
        if (filled > 0) return <span className="text-green-600 text-xs">✓ {filled}/{countTotalFields(sectionId)}</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'voies-neuro': {
        const filledA = countFilledFields(abcdeData.A || {});
        const filledD = countFilledFields(abcdeData.D || {});
        const total = filledA + filledD;
        const critA = !!(abcdeData.A?.obstructed || abcdeData.A?.stridor);
        const gcs = (vitalsData.gcsEye || 0) + (vitalsData.gcsVerbal || 0) + (vitalsData.gcsMotor || 0);
        const critD = !!(abcdeData.D?.seizures || abcdeData.D?.pupils === 'unequal' || abcdeData.D?.pupils === 'fixed' || (gcs > 0 && gcs <= 8));
        if (critA || critD) return <span className="text-red-600 font-medium text-xs">⚠ Critiques</span>;
        if (total > 0) return <span className="text-green-600 text-xs">✓ {total} renseigne{total > 1 ? 's' : ''}</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'etat-general': {
        const filled = countFilledFields(abcdeData.E || {});
        const crit = !!(abcdeData.E?.burns || (vitalsData.temperature != null && (vitalsData.temperature < 35 || vitalsData.temperature > 39)));
        if (crit) return <span className="text-red-600 font-medium text-xs">⚠ Critiques</span>;
        if (filled > 0) return <span className="text-green-600 text-xs">✓ {filled} renseigne{filled > 1 ? 's' : ''}</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'antecedents': {
        const hasData = !!(
          medicalHistoryData.chiefComplaint ||
          medicalHistoryData.symptomOnset ||
          medicalHistoryData.allergies ||
          (medicalHistoryData.chronicConditions && medicalHistoryData.chronicConditions.length > 0) ||
          (medicalHistoryData.currentMedications && medicalHistoryData.currentMedications.length > 0)
        );
        if (hasData) return <span className="text-green-600 text-xs">✓ Renseigne</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'notes': {
        if (triageNotes.trim()) return <span className="text-green-600 text-xs">✓ Renseigne</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      default:
        return null;
    }
  }, [vitalsData, abcdeData, medicalHistoryData, triageNotes]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Patient non trouve</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  // GCS total for display
  const gcsTotal = (vitalsData.gcsEye || 0) + (vitalsData.gcsVerbal || 0) + (vitalsData.gcsMotor || 0);
  const getGCSColor = (gcs: number): string => {
    if (gcs === 0) return 'bg-gray-200 text-gray-600';
    if (gcs <= 8) return 'bg-red-500 text-white';
    if (gcs < 12) return 'bg-orange-500 text-white';
    if (gcs < 15) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* ============================================================= */}
        {/* Sticky header: patient info + ScoreBar                        */}
        {/* ============================================================= */}
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
          {/* Patient info bar */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => navigate(CLIENT_ROUTES.nurse.triage.queue)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">
                  Triage: {patient.fullName}
                </h1>
                <p className="text-sm text-gray-500 truncate">
                  {patient.age} ans,{' '}
                  {patient.sex === 'MALE' ? 'Homme' : 'Femme'} &bull;{' '}
                  {patient.chiefComplaint || 'Motif non precise'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {saving && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSave}
                disabled={saving}
              >
                <Save className="h-4 w-4 mr-1" />
                Sauvegarder
              </Button>
            </div>
          </div>

          {/* Critical alerts banner */}
          {(hasCriticalVitals(vitalsData as Record<string, any>) || hasCriticalABCDE(abcdeData, vitalsData as Record<string, any>)) && (
            <div className="px-4 pb-2">
              <Alert className="bg-red-50 border-red-300 py-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 font-medium">
                  Signes critiques detectes - Evaluation SAUV probable
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Score bar */}
          <ScoreBar patient={patient} vitalsData={vitalsData} />
        </div>

        {/* ============================================================= */}
        {/* Messages                                                      */}
        {/* ============================================================= */}
        {error && (
          <div className="px-4 pt-3 max-w-4xl mx-auto w-full">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
        {successMsg && (
          <div className="px-4 pt-3 max-w-4xl mx-auto w-full">
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <AlertDescription>{successMsg}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* ============================================================= */}
        {/* Scrollable accordion content                                   */}
        {/* ============================================================= */}
        <div className="flex-1 overflow-y-auto pb-64 px-4 md:px-6 pt-4 max-w-4xl mx-auto w-full">
          <TriageAccordion onSectionCollapse={handleSectionCollapse} defaultOpen="signes-vitaux">

            {/* Section 1: Signes vitaux */}
            <TriageAccordionSection
              id="signes-vitaux"
              title="Signes vitaux"
              icon={Heart}
              statusSummary={getSectionStatus('signes-vitaux')}
            >
              <VitalsForm data={vitalsData} onChange={handleVitalsChange} />

              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium text-sm text-gray-700 mb-3">Observations respiratoires</h4>
                <BreathingForm
                  data={abcdeData.B}
                  onChange={(d) => handleAbcdeChange('B', d)}
                  vitalsData={vitalsData}
                  hideVitalBadges
                  hideNotes
                />
              </div>

              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium text-sm text-gray-700 mb-3">Observations circulatoires</h4>
                <CirculationForm
                  data={abcdeData.C}
                  onChange={(d) => handleAbcdeChange('C', d)}
                  vitalsData={vitalsData}
                  hideVitalBadges
                  hideNotes
                />
              </div>
            </TriageAccordionSection>

            {/* Section 2: Voies aériennes & Neurologie */}
            <TriageAccordionSection
              id="voies-neuro"
              title="Voies aeriennes & Neurologie"
              icon={Brain}
              statusSummary={getSectionStatus('voies-neuro')}
            >
              <h4 className="font-medium text-sm text-gray-700 mb-3">Voies aeriennes</h4>
              <AirwayForm
                data={abcdeData.A}
                onChange={(d) => handleAbcdeChange('A', d)}
                vitalsData={vitalsData}
                hideVitalBadges
                hideNotes
              />

              <div className="mt-6 pt-4 border-t">
                <h4 className="font-medium text-sm text-gray-700 mb-3">Neurologie</h4>
                <DisabilityForm
                  data={abcdeData.D}
                  onChange={(d) => handleAbcdeChange('D', d)}
                  vitalsData={vitalsData}
                  hideVitalBadges
                  hideNotes
                  hideGCSDisplay
                />
              </div>

              {/* Standalone GCS badge */}
              {gcsTotal > 0 && (
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-600">GCS Total:</span>
                  <div className={`px-4 py-2 rounded-full font-bold text-lg ${getGCSColor(gcsTotal)}`}>
                    {gcsTotal}/15
                  </div>
                </div>
              )}
            </TriageAccordionSection>

            {/* Section 3: Etat général */}
            <TriageAccordionSection
              id="etat-general"
              title="Etat general"
              icon={Thermometer}
              statusSummary={getSectionStatus('etat-general')}
            >
              <ExposureForm
                data={abcdeData.E}
                onChange={(d) => handleAbcdeChange('E', d)}
                vitalsData={vitalsData}
                hideVitalBadges
                hideNotes
              />
            </TriageAccordionSection>

            {/* Section 4: Antécédents */}
            <TriageAccordionSection
              id="antecedents"
              title="Antecedents"
              icon={ClipboardList}
              statusSummary={getSectionStatus('antecedents')}
            >
              <MedicalHistoryForm
                data={medicalHistoryData}
                onChange={handleHistoryChange}
              />
            </TriageAccordionSection>

            {/* Section 5: Notes */}
            <TriageAccordionSection
              id="notes"
              title="Notes"
              icon={FileText}
              statusSummary={getSectionStatus('notes')}
            >
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={triageNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Notes generales de triage..."
              />
            </TriageAccordionSection>

          </TriageAccordion>
        </div>

        {/* ============================================================= */}
        {/* Sticky decision panel at bottom                                */}
        {/* ============================================================= */}
        <DecisionPanel
          patient={patient}
          analysis={analysis}
          analyzing={analyzing}
          suggestion={suggestion}
          suggestedESI={suggestedESI}
          selectedESI={selectedESI}
          onESIChange={setSelectedESI}
          selectedOrientation={selectedOrientation}
          onOrientationChange={(orientation) => {
            setSelectedOrientation(orientation);
            if (orientation === suggestion?.suggestion) {
              setOverrideReason('');
            }
            setError(null);
          }}
          overrideReason={overrideReason}
          onOverrideReasonChange={(reason) => {
            setOverrideReason(reason);
            setError(null);
          }}
          onRunAnalysis={runAnalysis}
          onConfirm={handleComplete}
          saving={saving}
          canConfirm={canConfirm}
        />
      </div>
    </DashboardLayout>
  );
}
