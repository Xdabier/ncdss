import React, { useState } from 'react';
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  MapPin,
  Zap,
  CheckCircle2,
  Square,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AIPreDiagnosisPanel } from '../shared/AIPreDiagnosisPanel';
import type { ClinicalAnalysisResult, PathologyMatchResult } from '@ncdss/shared';

const orientationColors: Record<string, string> = {
  SAUV: 'bg-red-600 text-white',
  DECHOCAGE: 'bg-rose-700 text-white',
  TRAUMA: 'bg-orange-500 text-white',
  SURGICAL: 'bg-purple-500 text-white',
  MEDICAL: 'bg-blue-500 text-white',
  PEDIATRIC: 'bg-green-500 text-white',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  DECHOCAGE: 'Déchocage',
  TRAUMA: 'Traumatologie',
  SURGICAL: 'Chirurgical',
  MEDICAL: 'Medical',
  PEDIATRIC: 'Pediatrie',
};

const MAX_VISIBLE_INTERVENTIONS = 5;

interface SuggestionsDetailProps {
  analysis: ClinicalAnalysisResult | null;
  analyzing: boolean;
  patientId: string;
  onRunAnalysis: (force?: boolean) => void;
}

export function SuggestionsDetail({
  analysis,
  analyzing,
  patientId,
  onRunAnalysis,
}: SuggestionsDetailProps): React.ReactElement {
  const [showAllPathologies, setShowAllPathologies] = useState(false);
  const [showAllInterventions, setShowAllInterventions] = useState(false);
  const [checkedInterventions, setCheckedInterventions] = useState<Set<string>>(new Set());

  const toggleIntervention = (intervention: string): void => {
    setCheckedInterventions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(intervention)) newSet.delete(intervention);
      else newSet.add(intervention);
      return newSet;
    });
  };

  const getCombinedInterventions = (): string[] => {
    if (!analysis) return [];
    const nursing = (analysis.suggestedNursingInterventions || []).map(i => i.descriptionFr);
    const medical = (analysis.suggestedMedicalInterventions || []).map(i => i.descriptionFr);
    const combined: string[] = [];
    const maxLen = Math.max(nursing.length, medical.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < nursing.length) combined.push(nursing[i]);
      if (i < medical.length) combined.push(medical[i]);
    }
    return [...new Set(combined)];
  };

  const combinedInterventions = getCombinedInterventions();
  const visibleInterventions = showAllInterventions ? combinedInterventions : combinedInterventions.slice(0, MAX_VISIBLE_INTERVENTIONS);
  const hiddenInterventionsCount = combinedInterventions.length - MAX_VISIBLE_INTERVENTIONS;
  const topPathology = analysis?.topMatches?.[0];
  const otherPathologies = analysis?.topMatches?.slice(1) || [];

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Refresh button */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700">Analyse clinique</h3>
        <Button onClick={() => onRunAnalysis(true)} variant="ghost" size="sm" disabled={analyzing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${analyzing ? 'animate-spin' : ''}`} />
          Re-analyser
        </Button>
      </div>

      {analysis ? (
        <>
          {/* Critical alert */}
          {(analysis.suggestedOrientation === 'SAUV' || (analysis.criticalAlerts && analysis.criticalAlerts.length > 0)) && (
            <Alert className="bg-red-50 border-red-300">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 font-medium">
                {analysis.suggestedOrientation === 'SAUV'
                  ? 'Patient potentiellement instable - Orientation SAUV recommandee'
                  : analysis.criticalAlerts?.[0]}
              </AlertDescription>
            </Alert>
          )}

          {/* Orientation + Top Pathology */}
          <Card className={`border-2 ${analysis.suggestedOrientation === 'SAUV' ? 'border-red-400' : 'border-blue-400'}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <MapPin className={`h-5 w-5 ${analysis.suggestedOrientation === 'SAUV' ? 'text-red-600' : 'text-blue-600'}`} />
                  <span className="text-sm text-gray-600">Orientation recommandee</span>
                </div>
                <Badge className={`text-sm px-3 py-1 ${orientationColors[analysis.suggestedOrientation] || 'bg-gray-500 text-white'}`}>
                  {orientationLabels[analysis.suggestedOrientation] || analysis.suggestedOrientation}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3 pl-8">{analysis.orientationReason}</p>

              {topPathology && (
                <>
                  <div className="border-t border-gray-200 my-3" />
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
                </>
              )}

              {otherPathologies.length > 0 && (
                <div className="mt-3 pl-8">
                  <button onClick={() => setShowAllPathologies(!showAllPathologies)} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    {showAllPathologies ? <><ChevronUp className="h-4 w-4" />Masquer</> : <><ChevronDown className="h-4 w-4" />Voir {otherPathologies.length} autres pathologies</>}
                  </button>
                  {showAllPathologies && (
                    <div className="mt-3 space-y-2">
                      {otherPathologies.map((match: PathologyMatchResult) => (
                        <div key={match.pathologyId} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
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

          {/* Interventions checklist */}
          {combinedInterventions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Actions a effectuer
                  <Badge variant="secondary" className="ml-auto">{checkedInterventions.size}/{combinedInterventions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {visibleInterventions.map((intervention, index) => (
                    <button
                      key={index}
                      onClick={() => toggleIntervention(intervention)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                        checkedInterventions.has(intervention) ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {checkedInterventions.has(intervention) ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${checkedInterventions.has(intervention) ? 'text-green-800 line-through' : 'text-gray-700'}`}>
                        {intervention}
                      </span>
                    </button>
                  ))}
                </div>
                {hiddenInterventionsCount > 0 && (
                  <button onClick={() => setShowAllInterventions(!showAllInterventions)} className="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mx-auto">
                    {showAllInterventions ? <><ChevronUp className="h-4 w-4" />Afficher moins</> : <><ChevronDown className="h-4 w-4" />Voir {hiddenInterventionsCount} autres actions</>}
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI Pre-Diagnosis Panel */}
          <AIPreDiagnosisPanel patientId={patientId} />

          {/* Metadata */}
          <p className="text-xs text-gray-400 text-center">
            {analysis.observedSymptomCodes?.length || 0} signes | {analysis.matchedPathologiesCount} pathologies |
            Analyse {new Date(analysis.analysisTimestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </>
      ) : analyzing ? (
        <Card className="text-center py-8">
          <CardContent>
            <Brain className="h-12 w-12 mx-auto text-blue-500 animate-pulse mb-4" />
            <p className="text-lg">Analyse en cours...</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="text-center py-6">
          <CardContent>
            <Brain className="h-10 w-10 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500 mb-3">Aucune analyse disponible</p>
            <Button onClick={() => onRunAnalysis()} disabled={analyzing} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Lancer l'analyse
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
