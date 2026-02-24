import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Heart,
  Thermometer,
  ClipboardList,
  Stethoscope,
  Save,
  Loader2,
  CheckCircle,
  Eye,
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { VitalsForm, VitalsData } from '../../../components/abcde/VitalsForm';
import { ExposureForm } from '../../../components/abcde/ExposureForm';
import { MedicalHistoryForm, MedicalHistoryData } from '../../../components/abcde/MedicalHistoryForm';
import { SymptomsForm } from '../../../components/abcde/SymptomsForm';
import { TriageAccordion, useTriageAccordion } from '../../../components/triage/TriageAccordion';
import { TriageAccordionSection } from '../../../components/triage/TriageAccordionSection';
import { TriageTabNav } from '../../../components/triage/TriageTabNav';
import { ScoreBar } from '../../../components/triage/ScoreBar';
import { DecisionPanel, OrientationSuggestion } from '../../../components/triage/DecisionPanel';
import { splitSymptomsToABCDE, extractSymptomsFromABCDE } from '../../../utils/symptomsMapper';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, Orientation as OrientationType, OrientationSource, API_ROUTES } from '@ncdss/shared';
import type { ClinicalAnalysisResult, SymptomsFormData, UnifiedClinicalAnalysis } from '@ncdss/shared';
import { useFeatureFlagsStore } from '../../../stores/feature-flags.store';
import { suggestESI } from '../../../utils/scoreUtils';

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const sectionsMeta = [
  { id: 'signes-vitaux', label: 'Signes vitaux', icon: Heart },
  { id: 'symptomes', label: 'Symptomes', icon: Stethoscope },
  { id: 'etat-general', label: 'Etat general', icon: Thermometer },
  { id: 'antecedents', label: 'Antecedents', icon: ClipboardList },
];

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

function hasCriticalABCDE(symptoms: Partial<SymptomsFormData>, abcde: Record<string, any>, vitals: Record<string, any>): boolean {
  const E = abcde.E || {};
  const gcs = (vitals.gcsEye || 0) + (vitals.gcsVerbal || 0) + (vitals.gcsMotor || 0);

  return !!(
    symptoms.airwayStatus === 'obstrue' ||
    symptoms.breathSoundsDetail?.includes('stridor') ||
    symptoms.signesCutanes?.includes('cyanose') ||
    symptoms.pauseRespiratoire ||
    symptoms.bleedingInterne || symptoms.bleedingExteriorisee ||
    symptoms.pupilSymmetry === 'asymetrique' ||
    (gcs > 0 && gcs <= 8) ||
    E.burns
  );
}

const NORMAL_DEFAULTS: Record<string, unknown> = {
  airwayStatus: 'libre',
  auscultationNormal: true,
  pupilSymmetry: 'symetrique',
  pupilReactivity: true,
  gcsEye: 4,
  gcsVerbal: 5,
  gcsMotor: 6,
};

function countFilledFields(data: Record<string, any>): number {
  return Object.entries(data).filter(
    ([k, v]) =>
      v !== undefined && v !== null && v !== '' && v !== false &&
      NORMAL_DEFAULTS[k] !== v
  ).length;
}

function countTotalFields(sectionId: string): number {
  switch (sectionId) {
    case 'signes-vitaux': return 11;
    case 'symptomes': return 15;
    case 'etat-general': return 8;
    case 'antecedents': return 6;
    default: return 1;
  }
}

// ---------------------------------------------------------------------------
// Inner component (has access to TriageAccordion context)
// ---------------------------------------------------------------------------

function TriageWorkflowContent({ collapseHandlerRef }: { collapseHandlerRef: React.MutableRefObject<(id: string) => void> }): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openSections, openSection } = useTriageAccordion();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Triage result (shown after confirmation instead of navigating away)
  const [triageResult, setTriageResult] = useState<{
    patient: any;
    autoAssignment: {
      assigned: boolean;
      boxName?: string;
      doctorName?: string;
      reason?: string;
    };
  } | null>(null);

  // Form data
  const [medicalHistoryData, setMedicalHistoryData] = useState<Partial<MedicalHistoryData>>({});
  const [vitalsData, setVitalsData] = useState<Partial<VitalsData>>({
    gcsEye: 4,
    gcsVerbal: 5,
    gcsMotor: 6,
  });
  const [abcdeData, setAbcdeData] = useState<Record<string, any>>({
    A: {}, B: {}, C: {}, D: {}, E: {},
  });
  const [symptomsData, setSymptomsData] = useState<Partial<SymptomsFormData>>({
    airwayStatus: 'libre',
    auscultationNormal: true,
    pupilSymmetry: 'symetrique',
    pupilReactivity: true,
  });

  // Decision state
  const [analysis, setAnalysis] = useState<ClinicalAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedESI, setSuggestedESI] = useState<number | null>(null);
  const [selectedESI, setSelectedESI] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<OrientationSuggestion | null>(null);
  const [selectedOrientation, setSelectedOrientation] = useState<OrientationType | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Feature flag: unified analysis
  const useUnifiedAnalysis = useFeatureFlagsStore(s => s.useUnifiedAnalysis);

  const handleUnifiedAnalysisReady = useCallback((analysis: UnifiedClinicalAnalysis) => {
    const newSuggestion: OrientationSuggestion = {
      suggestion: analysis.orientation as OrientationType,
      source: OrientationSource.AI_SUGGESTION,
      reason: analysis.orientationReason,
      scores: {},
    };
    setSuggestion(newSuggestion);
    // AI suggestion becomes the authoritative orientation — no override reason needed
    setSelectedOrientation(analysis.orientation as OrientationType);
    setOverrideReason('');
  }, []);

  // Per-section dirty tracking
  const dirtyRef = useRef<Record<string, boolean>>({
    'signes-vitaux': false,
    'symptomes': false,
    'etat-general': false,
    'antecedents': false,
  });

  // Section refs for scroll-to
  const signesVitauxRef = useRef<HTMLDivElement>(null);
  const symptomesRef = useRef<HTMLDivElement>(null);
  const etatGeneralRef = useRef<HTMLDivElement>(null);
  const antecedentsRef = useRef<HTMLDivElement>(null);
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    'signes-vitaux': signesVitauxRef,
    'symptomes': symptomesRef,
    'etat-general': etatGeneralRef,
    'antecedents': antecedentsRef,
  };

  // Analysis debounce
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save interval
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Tab navigation & scroll tracking
  // -----------------------------------------------------------------------

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const prevOpenSectionsRef = useRef<Set<string>>(new Set());

  // Active section: prefer the explicitly-set tab, fall back to the first
  // open section so the highlight still works when opened via accordion click.
  const activeSection = activeTab && openSections.has(activeTab)
    ? activeTab
    : (() => {
        for (const s of sectionsMeta) {
          if (openSections.has(s.id)) return s.id;
        }
        return null;
      })();

  // Scroll a section into view, positioned just below the sticky headers.
  const scrollToSection = useCallback((sectionId: string) => {
    const el = sectionRefs[sectionId]?.current;
    if (!el) return;
    const stickyBottom = stickyHeaderRef.current?.getBoundingClientRect().bottom ?? 0;
    const elRect = el.getBoundingClientRect();
    const scrollY = window.scrollY + elRect.top - stickyBottom - 8;
    isAutoScrollingRef.current = true;
    window.scrollTo({ top: Math.max(0, scrollY), behavior: 'smooth' });
    setTimeout(() => { isAutoScrollingRef.current = false; }, 600);
  }, [sectionRefs]);

  const handleTabClick = useCallback((sectionId: string) => {
    setActiveTab(sectionId);
    openSection(sectionId);
    // Wait a tick for the section to expand, then scroll
    setTimeout(() => scrollToSection(sectionId), 50);
  }, [openSection, scrollToSection]);

  // When a section is opened via accordion click, scroll it into view and
  // update the active tab.  Wait for the collapse/expand CSS transition
  // (duration-300 = 300ms) to finish so the layout has settled before we
  // measure positions.
  useEffect(() => {
    for (const id of openSections) {
      if (!prevOpenSectionsRef.current.has(id) && !isAutoScrollingRef.current) {
        setActiveTab(id);
        isAutoScrollingRef.current = true;
        setTimeout(() => scrollToSection(id), 320);
      }
    }
    prevOpenSectionsRef.current = new Set(openSections);
  }, [openSections, scrollToSection]);

  // Track active tab from scroll position: the last section whose header is
  // at or above the bottom of the sticky header area is the "current" one.
  useEffect(() => {
    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;
      const stickyBottom = stickyHeaderRef.current?.getBoundingClientRect().bottom ?? 0;
      let found: string | null = null;
      for (const s of sectionsMeta) {
        const el = sectionRefs[s.id]?.current;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= stickyBottom + 50 && rect.bottom > stickyBottom) {
          found = s.id;
        }
      }
      if (found) setActiveTab(found);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sectionRefs]);

  // Track active tab from focus: when a user focuses an input inside a
  // section, highlight that section's tab.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      for (const s of sectionsMeta) {
        if (sectionRefs[s.id]?.current?.contains(target)) {
          setActiveTab(s.id);
          break;
        }
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [sectionRefs]);

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
        medicalHistoryNotes: p.medicalHistoryNotes ?? undefined,
        medicalHistory: p.medicalHistory ?? undefined,
        surgicalHistory: p.surgicalHistory ?? undefined,
        obstetricHistory: p.obstetricHistory ?? undefined,
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
        gcsEye: p.gcsEye ?? 4,
        gcsVerbal: p.gcsVerbal ?? 5,
        gcsMotor: p.gcsMotor ?? 6,
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

      // Extract symptoms from ABCDE data
      const symptoms = extractSymptomsFromABCDE(
        parsedAbcde.A, parsedAbcde.B, parsedAbcde.C, parsedAbcde.D, parsedAbcde.E
      );
      setSymptomsData(symptoms);

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
      setSelectedESI(esi);

      // Auto-run analysis if patient has ABCDE data (skip in unified mode — panel manages its own)
      const hasABCDEData = !!(p.abcdeAirway || p.abcdeBreathing || p.abcdeCirculation || p.abcdeDisability || p.abcdeExposure);
      if (hasABCDEData && !useUnifiedAnalysis) {
        runAnalysis();
      }

      // Reset dirty tracking
      Object.keys(dirtyRef.current).forEach(k => { dirtyRef.current[k] = false; });
    } catch {
      setError('Erreur de chargement du patient');
    } finally {
      setLoading(false);
    }
  }, [id, useUnifiedAnalysis]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // Auto-save interval
  useEffect(() => {
    autoSaveIntervalRef.current = setInterval(() => {
      saveAllDirty();
    }, 60000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [id, medicalHistoryData, vitalsData, abcdeData, symptomsData]);

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
    if (useUnifiedAnalysis) return; // Unified panel manages its own generation
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current);
    }
    analysisTimerRef.current = setTimeout(() => {
      runAnalysis(true);
    }, 2000);
  }, [runAnalysis, useUnifiedAnalysis]);

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

            const result = await api.put(API_ROUTES.patients.vitals(id), vitals);
            setPatient(result.data);

            const updatedPatient = result.data;
            const esi = suggestESI({
              newsScore: updatedPatient.newsScore ?? undefined,
              gcsScore: updatedPatient.gcsScore ?? undefined,
              qsofaScore: updatedPatient.qsofaScore ?? undefined,
              painLevel: updatedPatient.painLevel ?? undefined,
            });
            setSuggestedESI(esi);
            setSelectedESI(esi);
            break;
          }
          case 'symptomes': {
            const splitResult = splitSymptomsToABCDE(symptomsData);
            const mergedA = { ...abcdeData.A, ...splitResult.A };
            const mergedB = { ...abcdeData.B, ...splitResult.B };
            const mergedC = { ...abcdeData.C, ...splitResult.C };
            const mergedD = { ...abcdeData.D, ...splitResult.D };
            const mergedE = { ...abcdeData.E, ...splitResult.E };

            const abcde = API_ROUTES.patients.abcde;
            const results = await Promise.all([
              api.put(abcde(id, 'A'), mergedA),
              api.put(abcde(id, 'B'), mergedB),
              api.put(abcde(id, 'C'), mergedC),
              api.put(abcde(id, 'D'), mergedD),
              api.put(abcde(id, 'E'), mergedE),
            ]);
            setPatient(results[0].data);
            setAbcdeData({ A: mergedA, B: mergedB, C: mergedC, D: mergedD, E: mergedE });
            break;
          }
          case 'etat-general': {
            // Merge E data with symptoms-owned E fields, preserving E.notes
            const splitResult = splitSymptomsToABCDE(symptomsData);
            const mergedE = { ...abcdeData.E, ...splitResult.E, notes: abcdeData.E?.notes };
            const [response] = await Promise.all([
              api.put(API_ROUTES.patients.abcde(id, 'E'), mergedE),
              // Chief complaint / symptom onset are displayed in this section
              api.put(API_ROUTES.patients.medicalHistory(id), {
                chiefComplaint: medicalHistoryData.chiefComplaint,
                symptomOnset: medicalHistoryData.symptomOnset,
                allergies: medicalHistoryData.allergies,
                chronicConditions: medicalHistoryData.chronicConditions,
                currentMedications: medicalHistoryData.currentMedications,
                medicalHistoryNotes: medicalHistoryData.medicalHistoryNotes,
                medicalHistory: medicalHistoryData.medicalHistory,
                surgicalHistory: medicalHistoryData.surgicalHistory,
                obstetricHistory: medicalHistoryData.obstetricHistory,
              }),
            ]);
            setPatient(response.data);
            setAbcdeData(prev => ({ ...prev, E: mergedE }));
            break;
          }
          case 'antecedents': {
            const response = await api.put(API_ROUTES.patients.medicalHistory(id), {
              chiefComplaint: medicalHistoryData.chiefComplaint,
              symptomOnset: medicalHistoryData.symptomOnset,
              allergies: medicalHistoryData.allergies,
              chronicConditions: medicalHistoryData.chronicConditions,
              currentMedications: medicalHistoryData.currentMedications,
              medicalHistoryNotes: medicalHistoryData.medicalHistoryNotes,
              medicalHistory: medicalHistoryData.medicalHistory,
              surgicalHistory: medicalHistoryData.surgicalHistory,
              obstetricHistory: medicalHistoryData.obstetricHistory,
            });
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
    [id, medicalHistoryData, vitalsData, abcdeData, symptomsData],
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

  // Bridge the collapse handler to the outer component's ref
  collapseHandlerRef.current = handleSectionCollapse;

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
      if (category === 'E') {
        dirtyRef.current['etat-general'] = true;
      }
    },
    [],
  );

  const handleSymptomsChange = useCallback((data: Partial<SymptomsFormData>) => {
    setSymptomsData(data);
    dirtyRef.current['symptomes'] = true;
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
    selectedOrientation !== null;

  const handleComplete = useCallback(async () => {
    if (!selectedESI || !selectedOrientation || !id) return;

    setSaving(true);
    setError(null);

    try {
      await saveAllDirty();

      const api = await getApi();

      await api.put(API_ROUTES.patients.esi(id), { esiLevel: selectedESI });

      const response = await api.post(API_ROUTES.patients.completeTriage(id), {
        esiLevel: selectedESI,
        suggestedOrientation: suggestion?.suggestion,
        orientationSource: suggestion?.source,
        finalOrientation: selectedOrientation,
        overrideReason: isOrientationOverride ? overrideReason : null,
      });

      setTriageResult({
        patient: response.data,
        autoAssignment: response.data.autoAssignment || { assigned: false, reason: 'Affectation non disponible' },
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
      case 'symptomes': {
        const filled = countFilledFields(symptomsData);
        const critical = !!(
          symptomsData.airwayStatus === 'obstrue' ||
          symptomsData.bleedingInterne ||
          symptomsData.bleedingExteriorisee
        );
        if (critical) return <span className="text-red-600 font-medium text-xs">⚠ Critiques</span>;
        if (filled > 0) return <span className="text-green-600 text-xs">✓ {filled} renseigne{filled > 1 ? 's' : ''}</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'etat-general': {
        const E = abcdeData.E || {};
        let filled = 0;
        if (medicalHistoryData.chiefComplaint) filled++;
        if (medicalHistoryData.symptomOnset) filled++;
        if (E.rash) filled++;
        if (E.vomiting) filled++;
        if (E.diarrhea) filled++;
        if (E.lastMeal) filled++;
        if (E.wounds) filled++;
        if (E.edemaType?.length) filled += E.edemaType.length;
        if (E.burns) filled++;
        if (E.traumaSigns) filled++;
        if (E.notes) filled++;
        const crit = !!E.burns;
        if (crit) return <span className="text-red-600 font-medium text-xs">⚠ Critiques</span>;
        if (filled > 0) return <span className="text-green-600 text-xs">✓ {filled} renseigne{filled > 1 ? 's' : ''}</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      case 'antecedents': {
        const hasData = !!(
          medicalHistoryData.medicalHistory ||
          medicalHistoryData.surgicalHistory ||
          medicalHistoryData.obstetricHistory ||
          medicalHistoryData.allergies ||
          (medicalHistoryData.chronicConditions && medicalHistoryData.chronicConditions.length > 0) ||
          (medicalHistoryData.currentMedications && medicalHistoryData.currentMedications.length > 0) ||
          medicalHistoryData.medicalHistoryNotes
        );
        if (hasData) return <span className="text-green-600 text-xs">✓ Renseigne</span>;
        return <span className="text-gray-400 text-xs">── vide ──</span>;
      }
      default:
        return null;
    }
  }, [vitalsData, abcdeData, symptomsData, medicalHistoryData]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Patient non trouve</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
    <div className="pb-14">
      {/* ============================================================= */}
      {/* Sticky header: patient info + ScoreBar + TabNav               */}
      {/* ============================================================= */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-20 bg-white border-b shadow-sm">
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
        {(hasCriticalVitals(vitalsData as Record<string, any>) || hasCriticalABCDE(symptomsData, abcdeData, vitalsData as Record<string, any>)) && (
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

        {/* Tab navigation */}
        <TriageTabNav sections={sectionsMeta} activeId={activeSection} onTabClick={handleTabClick} />
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
      <div className="px-4 md:px-6 pt-4 max-w-4xl mx-auto w-full space-y-2">

        {/* Section 1: Signes vitaux */}
        <TriageAccordionSection
          id="signes-vitaux"
          title="Signes vitaux"
          icon={Heart}
          statusSummary={getSectionStatus('signes-vitaux')}
          sectionRef={signesVitauxRef}
        >
          <VitalsForm data={vitalsData} onChange={handleVitalsChange} />
        </TriageAccordionSection>

        {/* Section 2: Symptomes */}
        <TriageAccordionSection
          id="symptomes"
          title="Symptomes"
          icon={Stethoscope}
          statusSummary={getSectionStatus('symptomes')}
          sectionRef={symptomesRef}
        >
          <SymptomsForm data={symptomsData} onChange={handleSymptomsChange} />
        </TriageAccordionSection>

        {/* Section 3: Etat general */}
        <TriageAccordionSection
          id="etat-general"
          title="Etat general"
          icon={Thermometer}
          statusSummary={getSectionStatus('etat-general')}
          sectionRef={etatGeneralRef}
        >
          <ExposureForm
            data={abcdeData.E}
            onChange={(d) => handleAbcdeChange('E', d)}
            vitalsData={vitalsData}
            hideVitalBadges
            chiefComplaint={medicalHistoryData.chiefComplaint ?? ''}
            symptomOnset={medicalHistoryData.symptomOnset ?? ''}
            onChiefComplaintChange={(v) => {
              setMedicalHistoryData(prev => ({ ...prev, chiefComplaint: v }));
              dirtyRef.current['etat-general'] = true;
            }}
            onSymptomOnsetChange={(v) => {
              setMedicalHistoryData(prev => ({ ...prev, symptomOnset: v }));
              dirtyRef.current['etat-general'] = true;
            }}
          />
        </TriageAccordionSection>

        {/* Section 4: Antecedents */}
        <TriageAccordionSection
          id="antecedents"
          title="Antecedents"
          icon={ClipboardList}
          statusSummary={getSectionStatus('antecedents')}
          sectionRef={antecedentsRef}
        >
          <MedicalHistoryForm
            data={medicalHistoryData}
            onChange={handleHistoryChange}
          />
        </TriageAccordionSection>

      </div>
    </div>

    {/* ============================================================= */}
    {/* Decision panel — fixed layer, independent of workflow scroll   */}
    {/* ============================================================= */}
    {!triageResult && (
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
        useUnifiedAnalysis={useUnifiedAnalysis}
        onUnifiedAnalysisReady={handleUnifiedAnalysisReady}
      />
    )}

    {/* ============================================================= */}
    {/* Triage result overlay                                          */}
    {/* ============================================================= */}
    {triageResult && (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-6">
            {/* Success header */}
            <div className="text-center space-y-2">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">Triage termine</h2>
            </div>

            {/* Patient info */}
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">{triageResult.patient.fullName}</p>
              <div className="flex items-center justify-center gap-2">
                <Badge className={
                  selectedESI === 1 ? 'bg-red-600 text-white' :
                  selectedESI === 2 ? 'bg-orange-500 text-white' :
                  selectedESI === 3 ? 'bg-yellow-500 text-white' :
                  selectedESI === 4 ? 'bg-green-500 text-white' :
                  'bg-blue-500 text-white'
                }>
                  ESI {selectedESI}
                </Badge>
                <Badge variant="outline">
                  {selectedOrientation === 'SAUV' ? 'SAUV' :
                   selectedOrientation === 'MEDICAL' ? 'Medical' :
                   selectedOrientation === 'SURGICAL' ? 'Chirurgical' :
                   selectedOrientation === 'TRAUMA' ? 'Traumato' :
                   selectedOrientation}
                </Badge>
              </div>
            </div>

            {/* Assignment section */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Affectation</h3>
              {triageResult.autoAssignment.assigned ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm">Box : <strong>{triageResult.autoAssignment.boxName}</strong></span>
                  </div>
                  {triageResult.autoAssignment.doctorName ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <span className="text-sm">Medecin : <strong>{triageResult.autoAssignment.doctorName}</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-sm text-orange-700">Aucun medecin disponible</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-sm text-orange-700">
                      En attente — {triageResult.autoAssignment.reason}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Le patient sera visible dans la file de traitement
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => navigate(CLIENT_ROUTES.nurse.triage.queue)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour a la file de triage
              </Button>
              {triageResult.autoAssignment.assigned && id && (
                <Button
                  variant="outline"
                  onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id))}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Voir le patient
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export — wraps TriageAccordion around the inner content
// ---------------------------------------------------------------------------

export default function TriageWorkflow(): React.ReactElement {
  // We need a ref-based approach because TriageAccordion needs onSectionCollapse
  // but the collapse handler lives in TriageWorkflowContent (inside the provider).
  // The collapseHandlerRef bridges this gap.
  const collapseHandlerRef = useRef<(id: string) => void>(() => {});

  const handleSectionCollapse = useCallback((id: string) => {
    collapseHandlerRef.current(id);
  }, []);

  return (
    <DashboardLayout>
      <TriageAccordion onSectionCollapse={handleSectionCollapse} defaultOpen="signes-vitaux">
        <TriageWorkflowContent collapseHandlerRef={collapseHandlerRef} />
      </TriageAccordion>
    </DashboardLayout>
  );
}
