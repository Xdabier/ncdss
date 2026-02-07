// @deprecated - This page is now merged into TriageComplete (Suggestions tab).
// Routes redirect to /complete. Kept for reference only.
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, MapPin, Brain, RefreshCw, Zap, Square } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { AIPreDiagnosisPanel } from '../../../components/shared/AIPreDiagnosisPanel';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, API_ROUTES } from '@ncdss/shared';
import type { ClinicalAnalysisResult, PathologyMatchResult } from '@ncdss/shared';

const orientationColors: Record<string, string> = {
  SAUV: 'bg-red-600 text-white',
  TRAUMA: 'bg-orange-500 text-white',
  SURGICAL: 'bg-purple-500 text-white',
  MEDICAL: 'bg-blue-500 text-white',
  PEDIATRIC: 'bg-green-500 text-white',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  TRAUMA: 'Traumatologie',
  SURGICAL: 'Chirurgical',
  MEDICAL: 'Médical',
  PEDIATRIC: 'Pédiatrie',
};

const orientationDescriptions: Record<string, string> = {
  SAUV: 'Salle d\'Accueil des Urgences Vitales',
  TRAUMA: 'Box traumatologie',
  SURGICAL: 'Box chirurgical',
  MEDICAL: 'Box médical',
  PEDIATRIC: 'Box pédiatrique',
};

// Maximum items to show by default
const MAX_VISIBLE_INTERVENTIONS = 5;
const MAX_VISIBLE_PATHOLOGIES = 1;

export default function SuggestionsReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [analysis, setAnalysis] = useState<ClinicalAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expansion states
  const [showAllPathologies, setShowAllPathologies] = useState(false);
  const [showAllInterventions, setShowAllInterventions] = useState(false);

  // Checklist state for interventions
  const [checkedInterventions, setCheckedInterventions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPatientAndAnalyze();
  }, [id]);

  const loadPatientAndAnalyze = async () => {
    try {
      setLoading(true);
      const api = await getApi();
      const patientResponse = await api.get(API_ROUTES.patients.byId(id!));
      setPatient(patientResponse.data);
      await runAnalysis();
    } catch (e) {
      setError('Erreur de chargement du patient');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async (forceReanalyze = false) => {
    try {
      setAnalyzing(true);
      setError(null);
      const api = await getApi();
      const analysisResponse = await api.post(API_ROUTES.patients.analyzeFindings(id!), {
        forceReanalyze
      });
      setAnalysis(analysisResponse.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de l\'analyse des donnees cliniques');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleContinue = () => {
    navigate(CLIENT_ROUTES.nurse.triage.score(id!));
  };

  const toggleIntervention = (intervention: string) => {
    setCheckedInterventions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(intervention)) {
        newSet.delete(intervention);
      } else {
        newSet.add(intervention);
      }
      return newSet;
    });
  };

  // Combine and prioritize interventions
  const getCombinedInterventions = (): string[] => {
    if (!analysis) return [];
    const nursing = (analysis.suggestedNursingInterventions || []).map(i => i.descriptionFr);
    const medical = (analysis.suggestedMedicalInterventions || []).map(i => i.descriptionFr);
    // Interleave nursing and medical, nursing first (they're typically more immediate)
    const combined: string[] = [];
    const maxLen = Math.max(nursing.length, medical.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < nursing.length) combined.push(nursing[i]);
      if (i < medical.length) combined.push(medical[i]);
    }
    return [...new Set(combined)]; // Remove duplicates
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Brain className="h-12 w-12 mx-auto text-blue-500 animate-pulse mb-4" />
            <p className="text-lg">Analyse en cours...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">Patient non trouve</div>
      </DashboardLayout>
    );
  }

  const combinedInterventions = getCombinedInterventions();
  const visibleInterventions = showAllInterventions
    ? combinedInterventions
    : combinedInterventions.slice(0, MAX_VISIBLE_INTERVENTIONS);
  const hiddenInterventionsCount = combinedInterventions.length - MAX_VISIBLE_INTERVENTIONS;

  const topPathology = analysis?.topMatches?.[0];
  const otherPathologies = analysis?.topMatches?.slice(1) || [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(CLIENT_ROUTES.nurse.triage.abcde(id!))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{patient.fullName}</h1>
              <p className="text-xs text-gray-500">
                {patient.age} ans • {patient.chiefComplaint || 'Motif non specifie'}
              </p>
            </div>
          </div>
          <Button onClick={() => runAnalysis(true)} variant="ghost" size="sm" disabled={analyzing}>
            <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {analysis && (
          <div className="space-y-4">
            {/* CRITICAL ALERT - Only if SAUV or critical alerts exist */}
            {(analysis.suggestedOrientation === 'SAUV' || (analysis.criticalAlerts && analysis.criticalAlerts.length > 0)) && (
              <Alert className="bg-red-50 border-red-300">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 font-medium">
                  {analysis.suggestedOrientation === 'SAUV'
                    ? 'Patient potentiellement instable - Orientation SAUV recommandee'
                    : analysis.criticalAlerts?.[0]
                  }
                </AlertDescription>
              </Alert>
            )}

            {/* MAIN CARD: Orientation + Top Pathology */}
            <Card className={`border-2 ${analysis.suggestedOrientation === 'SAUV' ? 'border-red-400' : 'border-blue-400'}`}>
              <CardContent className="pt-6">
                {/* Orientation - Large and prominent */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <MapPin className={`h-5 w-5 ${analysis.suggestedOrientation === 'SAUV' ? 'text-red-600' : 'text-blue-600'}`} />
                    <span className="text-sm text-gray-600">Orientation recommandee</span>
                  </div>
                  <Badge className={`text-lg px-4 py-2 ${orientationColors[analysis.suggestedOrientation] || 'bg-gray-500 text-white'}`}>
                    {orientationLabels[analysis.suggestedOrientation] || analysis.suggestedOrientation}
                  </Badge>
                </div>

                {/* Reason - Subtle */}
                <p className="text-sm text-gray-600 mb-4 pl-8">
                  {analysis.orientationReason || orientationDescriptions[analysis.suggestedOrientation]}
                </p>

                {/* Divider */}
                <div className="border-t border-gray-200 my-4" />

                {/* Top Pathology */}
                {topPathology && (
                  <div className="pl-8">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Pathologie principale</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{topPathology.pathologyName}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${topPathology.confidence >= 70 ? 'bg-green-500' : topPathology.confidence >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                            style={{ width: `${topPathology.confidence}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{topPathology.confidence}%</span>
                      </div>
                    </div>
                    {topPathology.matchedSymptomCodes && topPathology.matchedSymptomCodes.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Signes: {topPathology.matchedSymptomCodes.slice(0, 3).join(', ')}
                        {topPathology.matchedSymptomCodes.length > 3 && '...'}
                      </p>
                    )}
                  </div>
                )}

                {/* Expandable: Other Pathologies */}
                {otherPathologies.length > 0 && (
                  <div className="mt-3 pl-8">
                    <button
                      onClick={() => setShowAllPathologies(!showAllPathologies)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      {showAllPathologies ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Masquer les autres pathologies
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Voir {otherPathologies.length} autres pathologies possibles
                        </>
                      )}
                    </button>

                    {showAllPathologies && (
                      <div className="mt-3 space-y-2">
                        {otherPathologies.map((match: PathologyMatchResult) => (
                          <div
                            key={match.pathologyId}
                            className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm"
                          >
                            <span className="text-gray-700">{match.pathologyName}</span>
                            <span className="text-gray-500">{match.confidence}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ACTIONS CARD: Checklist */}
            {combinedInterventions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Actions a effectuer
                    <Badge variant="secondary" className="ml-auto">
                      {checkedInterventions.size}/{combinedInterventions.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {visibleInterventions.map((intervention, index) => (
                      <button
                        key={index}
                        onClick={() => toggleIntervention(intervention)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          checkedInterventions.has(intervention)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {checkedInterventions.has(intervention) ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${checkedInterventions.has(intervention) ? 'text-green-800 line-through' : 'text-gray-700'}`}>
                          {intervention}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Expand/Collapse for more interventions */}
                  {hiddenInterventionsCount > 0 && (
                    <button
                      onClick={() => setShowAllInterventions(!showAllInterventions)}
                      className="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mx-auto"
                    >
                      {showAllInterventions ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Afficher moins
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Voir {hiddenInterventionsCount} autres actions
                        </>
                      )}
                    </button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Pre-Diagnosis Panel */}
            <AIPreDiagnosisPanel patientId={id!} />

            {/* Minimal footer metadata */}
            <p className="text-xs text-gray-400 text-center">
              {analysis.observedSymptomCodes?.length || 0} signes • {analysis.matchedPathologiesCount} pathologies •
              Analyse {new Date(analysis.analysisTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" size="sm" onClick={() => navigate(CLIENT_ROUTES.nurse.triage.abcde(id!))}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Modifier ABCDE
              </Button>
              <Button onClick={handleContinue} className="px-6">
                Continuer
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {!analysis && !analyzing && (
          <Card className="text-center py-8">
            <CardContent>
              <Brain className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500 mb-4">Aucune analyse disponible</p>
              <Button onClick={() => runAnalysis()} disabled={analyzing} size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
                Lancer l'analyse
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
