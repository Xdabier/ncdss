import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Heart,
  Wind,
  Activity,
  Droplets,
  Brain,
  Thermometer,
  Save,
  Loader2,
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { VitalsForm, VitalsData } from '../../../components/abcde/VitalsForm';
import { AirwayForm } from '../../../components/abcde/AirwayForm';
import { BreathingForm } from '../../../components/abcde/BreathingForm';
import { CirculationForm } from '../../../components/abcde/CirculationForm';
import { DisabilityForm } from '../../../components/abcde/DisabilityForm';
import { ExposureForm } from '../../../components/abcde/ExposureForm';
import { getApi } from '../../../services/api';
import { Patient } from '@ncdss/shared';
import { cn } from '../../../lib/utils';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'vitals', label: 'Signes vitaux', shortLabel: 'Vitaux', icon: Heart, category: null },
  { id: 'airway', label: 'A - Airway', shortLabel: 'A', icon: Wind, category: 'A' },
  { id: 'breathing', label: 'B - Breathing', shortLabel: 'B', icon: Activity, category: 'B' },
  { id: 'circulation', label: 'C - Circulation', shortLabel: 'C', icon: Droplets, category: 'C' },
  { id: 'disability', label: 'D - Disability', shortLabel: 'D', icon: Brain, category: 'D' },
  { id: 'exposure', label: 'E - Exposure', shortLabel: 'E', icon: Thermometer, category: 'E' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Critical findings helpers
// ---------------------------------------------------------------------------

function hasCriticalFindings(tabId: TabId, data: Record<string, any>): boolean {
  switch (tabId) {
    case 'airway':
      return !!(data.obstructed || data.stridor);
    case 'breathing':
      return !!(
        data.cyanosis ||
        data.breathSounds === 'absent' ||
        data.workOfBreathing === 'severe' ||
        (data.respiratoryRate != null && (data.respiratoryRate < 8 || data.respiratoryRate > 30)) ||
        (data.oxygenSaturation != null && data.oxygenSaturation < 90)
      );
    case 'circulation':
      return !!(
        data.bleeding ||
        data.skinColor === 'mottled' ||
        data.skinColor === 'cyanotic' ||
        data.peripheralPulses === 'absent' ||
        (data.heartRate != null && (data.heartRate < 50 || data.heartRate > 120)) ||
        (data.systolicBP != null && (data.systolicBP < 90 || data.systolicBP > 180))
      );
    case 'disability': {
      const gcs = (data.gcsEye || 0) + (data.gcsVerbal || 0) + (data.gcsMotor || 0);
      return !!(
        data.seizures ||
        data.pupils === 'unequal' ||
        data.pupils === 'fixed' ||
        data.motorResponse === 'paralysis' ||
        data.motorResponse === 'lateralized' ||
        (gcs > 0 && gcs <= 8) ||
        (data.glucoseLevel != null && (data.glucoseLevel < 60 || data.glucoseLevel > 300))
      );
    }
    case 'exposure':
      return !!(
        data.burns ||
        (data.temperature != null && (data.temperature < 35 || data.temperature > 39))
      );
    case 'vitals': {
      return !!(
        (data.temperature != null && (data.temperature < 35 || data.temperature > 39)) ||
        (data.heartRate != null && (data.heartRate < 50 || data.heartRate > 120)) ||
        (data.respiratoryRate != null && (data.respiratoryRate < 8 || data.respiratoryRate > 30)) ||
        (data.oxygenSaturation != null && data.oxygenSaturation < 90) ||
        (data.systolicBP != null && (data.systolicBP < 90 || data.systolicBP > 180))
      );
    }
    default:
      return false;
  }
}

function hasAnyData(tabId: TabId, data: Record<string, any>): boolean {
  return Object.values(data).some(
    (v) => v !== undefined && v !== null && v !== '' && v !== false
  );
}

// ---------------------------------------------------------------------------
// Score colour helpers
// ---------------------------------------------------------------------------

function getNewsColor(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score >= 7) return 'bg-red-500 text-white';
  if (score >= 5) return 'bg-orange-500 text-white';
  if (score >= 1) return 'bg-yellow-400 text-black';
  return 'bg-green-500 text-white';
}

function getGcsColor(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score <= 8) return 'bg-red-500 text-white';
  if (score < 12) return 'bg-orange-500 text-white';
  if (score < 15) return 'bg-yellow-400 text-black';
  return 'bg-green-500 text-white';
}

function getQsofaColor(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score >= 2) return 'bg-red-500 text-white';
  if (score >= 1) return 'bg-yellow-400 text-black';
  return 'bg-green-500 text-white';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TriageWorkflow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('vitals');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form data
  const [vitalsData, setVitalsData] = useState<Partial<VitalsData>>({});
  const [abcdeData, setAbcdeData] = useState<Record<string, any>>({
    A: {},
    B: {},
    C: {},
    D: {},
    E: {},
  });

  // Track which tabs have persisted data
  const [savedTabs, setSavedTabs] = useState<Record<TabId, boolean>>({
    vitals: false,
    airway: false,
    breathing: false,
    circulation: false,
    disability: false,
    exposure: false,
  });

  // Track dirty state to know if we need to save before tab change
  const isDirtyRef = useRef(false);

  // -----------------------------------------------------------------------
  // Patient loading
  // -----------------------------------------------------------------------

  const loadPatient = useCallback(async () => {
    if (!id) return;
    try {
      const api = await getApi();
      const response = await api.get(`/patients/${id}`);
      const p: Patient = response.data;
      setPatient(p);

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

      // Initialise ABCDE from JSON blobs, with fallback to flat fields
      setAbcdeData({
        A: p.abcdeAirway
          ? JSON.parse(p.abcdeAirway as string)
          : p.painLevel != null
            ? { painLevel: p.painLevel }
            : {},
        B: p.abcdeBreathing
          ? JSON.parse(p.abcdeBreathing as string)
          : {
              ...(p.respiratoryRate != null ? { respiratoryRate: p.respiratoryRate } : {}),
              ...(p.oxygenSaturation != null ? { oxygenSaturation: p.oxygenSaturation } : {}),
            },
        C: p.abcdeCirculation
          ? JSON.parse(p.abcdeCirculation as string)
          : {
              ...(p.heartRate != null ? { heartRate: p.heartRate } : {}),
              ...(p.systolicBP != null ? { systolicBP: p.systolicBP } : {}),
              ...(p.diastolicBP != null ? { diastolicBP: p.diastolicBP } : {}),
            },
        D: p.abcdeDisability
          ? JSON.parse(p.abcdeDisability as string)
          : {
              ...(p.gcsEye != null ? { gcsEye: p.gcsEye } : {}),
              ...(p.gcsVerbal != null ? { gcsVerbal: p.gcsVerbal } : {}),
              ...(p.gcsMotor != null ? { gcsMotor: p.gcsMotor } : {}),
              ...(p.glucoseLevel != null ? { glucoseLevel: p.glucoseLevel } : {}),
            },
        E: p.abcdeExposure
          ? JSON.parse(p.abcdeExposure as string)
          : p.temperature != null
            ? { temperature: p.temperature }
            : {},
      });

      // Track saved state
      setSavedTabs({
        vitals: !!(p.temperature || p.heartRate || p.respiratoryRate || p.oxygenSaturation || p.systolicBP),
        airway: !!p.abcdeAirway,
        breathing: !!p.abcdeBreathing,
        circulation: !!p.abcdeCirculation,
        disability: !!p.abcdeDisability,
        exposure: !!p.abcdeExposure,
      });

      isDirtyRef.current = false;
    } catch {
      setError('Erreur de chargement du patient');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // -----------------------------------------------------------------------
  // Save helpers
  // -----------------------------------------------------------------------

  const saveTab = useCallback(
    async (tabId: TabId): Promise<boolean> => {
      if (!id) return false;
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      try {
        const api = await getApi();

        if (tabId === 'vitals') {
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

          const response = await api.put(`/patients/${id}/vitals`, vitals);
          setPatient(response.data);
        } else {
          const categoryMap: Record<string, string> = {
            airway: 'A',
            breathing: 'B',
            circulation: 'C',
            disability: 'D',
            exposure: 'E',
          };
          const cat = categoryMap[tabId];
          const response = await api.put(`/patients/${id}/abcde/${cat}`, abcdeData[cat]);
          setPatient(response.data);
        }

        setSavedTabs((prev) => ({ ...prev, [tabId]: true }));
        isDirtyRef.current = false;
        return true;
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de sauvegarde');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [id, vitalsData, abcdeData],
  );

  // -----------------------------------------------------------------------
  // Tab change with auto-save
  // -----------------------------------------------------------------------

  const handleTabChange = useCallback(
    async (newTab: TabId) => {
      if (newTab === activeTab) return;
      if (isDirtyRef.current) {
        const saved = await saveTab(activeTab);
        if (!saved) return;
      }
      setActiveTab(newTab);
      setError(null);
      setSuccessMsg(null);
    },
    [activeTab, saveTab],
  );

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const currentIndex = TABS.findIndex((t) => t.id === activeTab);
  const isFirstTab = currentIndex === 0;
  const isLastTab = currentIndex === TABS.length - 1;

  const handlePrevious = useCallback(async () => {
    if (isFirstTab) return;
    await handleTabChange(TABS[currentIndex - 1].id);
  }, [currentIndex, isFirstTab, handleTabChange]);

  const handleNext = useCallback(async () => {
    if (isLastTab) {
      // Save and navigate to suggestions
      const saved = await saveTab(activeTab);
      if (saved) {
        navigate(`/nurse/triage/${id}/suggestions`);
      }
    } else {
      await handleTabChange(TABS[currentIndex + 1].id);
    }
  }, [isLastTab, activeTab, currentIndex, saveTab, handleTabChange, navigate, id]);

  const handleSave = useCallback(async () => {
    const saved = await saveTab(activeTab);
    if (saved) {
      setSuccessMsg('Donnees enregistrees');
      setTimeout(() => setSuccessMsg(null), 2000);
    }
  }, [activeTab, saveTab]);

  // -----------------------------------------------------------------------
  // Form change handlers (mark dirty)
  // -----------------------------------------------------------------------

  const handleVitalsChange = useCallback((data: Partial<VitalsData>) => {
    setVitalsData(data);
    isDirtyRef.current = true;
  }, []);

  const handleAbcdeChange = useCallback(
    (category: string, data: any) => {
      setAbcdeData((prev) => ({ ...prev, [category]: data }));
      isDirtyRef.current = true;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Tab status
  // -----------------------------------------------------------------------

  const getTabStatus = useCallback(
    (tabId: TabId): 'empty' | 'completed' | 'critical' => {
      const tab = TABS.find((t) => t.id === tabId)!;
      const data = tab.category ? abcdeData[tab.category] : vitalsData;

      if (hasCriticalFindings(tabId, data || {})) return 'critical';
      if (savedTabs[tabId] && hasAnyData(tabId, data || {})) return 'completed';
      return 'empty';
    },
    [abcdeData, vitalsData, savedTabs],
  );

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

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* ============================================================= */}
        {/* Sticky Header                                                 */}
        {/* ============================================================= */}
        <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
          {/* Patient info bar */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => navigate('/nurse/triage')}
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Sauvegarder
              </Button>
            </div>
          </div>

          {/* Score bar */}
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            <Badge className={cn('text-xs', getNewsColor(patient.newsScore))}>
              NEWS: {patient.newsScore ?? '--'}
            </Badge>
            <Badge className={cn('text-xs', getGcsColor(patient.gcsScore))}>
              GCS: {patient.gcsScore ?? '--'}/15
            </Badge>
            <Badge className={cn('text-xs', getQsofaColor(patient.qsofaScore))}>
              qSOFA: {patient.qsofaScore ?? '--'}
            </Badge>
            {patient.painLevel != null && (
              <Badge
                variant="outline"
                className="text-xs"
              >
                Douleur: {patient.painLevel}/10
              </Badge>
            )}
          </div>

          {/* Tab bar */}
          <div className="px-2 flex overflow-x-auto bg-gray-50 border-t">
            {TABS.map((tab) => {
              const status = getTabStatus(tab.id);
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">{tab.shortLabel}</span>

                  {/* Status indicator */}
                  {status === 'critical' && (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}
                  {status === 'completed' && (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================================================= */}
        {/* Messages                                                      */}
        {/* ============================================================= */}
        {error && (
          <div className="px-4 pt-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}
        {successMsg && (
          <div className="px-4 pt-3">
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <AlertDescription>{successMsg}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* ============================================================= */}
        {/* Tab Content                                                    */}
        {/* ============================================================= */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
          <Card className="border-t-4 border-t-blue-600">
            <CardContent className="p-6">
              {activeTab === 'vitals' && (
                <VitalsForm
                  data={vitalsData}
                  onChange={handleVitalsChange}
                />
              )}
              {activeTab === 'airway' && (
                <AirwayForm
                  data={abcdeData.A}
                  onChange={(d) => handleAbcdeChange('A', d)}
                />
              )}
              {activeTab === 'breathing' && (
                <BreathingForm
                  data={abcdeData.B}
                  onChange={(d) => handleAbcdeChange('B', d)}
                />
              )}
              {activeTab === 'circulation' && (
                <CirculationForm
                  data={abcdeData.C}
                  onChange={(d) => handleAbcdeChange('C', d)}
                />
              )}
              {activeTab === 'disability' && (
                <DisabilityForm
                  data={abcdeData.D}
                  onChange={(d) => handleAbcdeChange('D', d)}
                />
              )}
              {activeTab === 'exposure' && (
                <ExposureForm
                  data={abcdeData.E}
                  onChange={(d) => handleAbcdeChange('E', d)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ============================================================= */}
        {/* Bottom navigation                                             */}
        {/* ============================================================= */}
        <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirstTab || saving}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Precedent
          </Button>

          <span className="text-sm text-gray-400">
            {currentIndex + 1} / {TABS.length}
          </span>

          <Button onClick={handleNext} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isLastTab ? (
              <>
                Terminer le triage
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                Suivant
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
