import React, { useState } from 'react';
import {
  CheckCircle2,
  Lightbulb,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
  MapPin,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { SuggestionsDetail } from './SuggestionsDetail';
import { Patient, Orientation as OrientationType } from '@ncdss/shared';
import type { ClinicalAnalysisResult } from '@ncdss/shared';

// =============================================================================
// ESI Levels
// =============================================================================

interface ESILevel {
  level: number;
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  selectedBg: string;
}

const ESI_LEVELS: ESILevel[] = [
  { level: 1, label: 'Reanimation immediate', bgColor: 'bg-red-100', borderColor: 'border-red-500', textColor: 'text-red-900', selectedBg: 'bg-red-500 text-white' },
  { level: 2, label: 'Urgence vitale', bgColor: 'bg-orange-100', borderColor: 'border-orange-500', textColor: 'text-orange-900', selectedBg: 'bg-orange-500 text-white' },
  { level: 3, label: 'Urgent', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', textColor: 'text-yellow-900', selectedBg: 'bg-yellow-500 text-white' },
  { level: 4, label: 'Moins urgent', bgColor: 'bg-green-100', borderColor: 'border-green-500', textColor: 'text-green-900', selectedBg: 'bg-green-500 text-white' },
  { level: 5, label: 'Non urgent', bgColor: 'bg-blue-100', borderColor: 'border-blue-500', textColor: 'text-blue-900', selectedBg: 'bg-blue-500 text-white' },
];

// =============================================================================
// Orientation Options
// =============================================================================

interface OrientationOption {
  value: OrientationType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  selectedBg: string;
}

const ORIENTATION_OPTIONS: OrientationOption[] = [
  { value: OrientationType.SAUV, label: 'SAUV', color: 'text-red-900', bgColor: 'bg-red-100', borderColor: 'border-red-500', selectedBg: 'bg-red-500 text-white' },
  { value: OrientationType.MEDICAL, label: 'Medical', color: 'text-blue-900', bgColor: 'bg-blue-100', borderColor: 'border-blue-500', selectedBg: 'bg-blue-500 text-white' },
  { value: OrientationType.SURGICAL, label: 'Chirurgical', color: 'text-purple-900', bgColor: 'bg-purple-100', borderColor: 'border-purple-500', selectedBg: 'bg-purple-500 text-white' },
  { value: OrientationType.TRAUMA, label: 'Traumato', color: 'text-orange-900', bgColor: 'bg-orange-100', borderColor: 'border-orange-500', selectedBg: 'bg-orange-500 text-white' },
  { value: OrientationType.PEDIATRIC, label: 'Pediatrie', color: 'text-green-900', bgColor: 'bg-green-100', borderColor: 'border-green-500', selectedBg: 'bg-green-500 text-white' },
];

const PEDIATRIC_AGE_THRESHOLD = 15;

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
  MEDICAL: 'Medical',
  PEDIATRIC: 'Pediatrie',
};

// =============================================================================
// Types
// =============================================================================

export interface OrientationSuggestion {
  suggestion: OrientationType;
  source: string;
  reason: string;
  scores: { news?: number; gcs?: number; qsofa?: number; esi?: number };
}

export interface DecisionPanelProps {
  patient: Patient;
  analysis: ClinicalAnalysisResult | null;
  analyzing: boolean;
  suggestion: OrientationSuggestion | null;
  suggestedESI: number | null;
  selectedESI: number | null;
  onESIChange: (level: number) => void;
  selectedOrientation: OrientationType | null;
  onOrientationChange: (orientation: OrientationType) => void;
  overrideReason: string;
  onOverrideReasonChange: (reason: string) => void;
  onRunAnalysis: (force?: boolean) => void;
  onConfirm: () => void;
  saving: boolean;
  canConfirm: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function DecisionPanel({
  patient,
  analysis,
  analyzing,
  suggestion,
  suggestedESI,
  selectedESI,
  onESIChange,
  selectedOrientation,
  onOrientationChange,
  overrideReason,
  onOverrideReasonChange,
  onRunAnalysis,
  onConfirm,
  saving,
  canConfirm,
}: DecisionPanelProps): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);

  const isOrientationOverride =
    selectedOrientation !== null &&
    suggestion !== null &&
    selectedOrientation !== suggestion.suggestion;

  const availableOrientations = ORIENTATION_OPTIONS.filter((opt) => {
    if (opt.value === OrientationType.PEDIATRIC) return patient.age < PEDIATRIC_AGE_THRESHOLD;
    return true;
  });

  const topPathology = analysis?.topMatches?.[0];

  return (
    <>
      {/* Expandable detail overlay */}
      {showDetails && (
        <div className="border-t bg-white shadow-lg max-h-[50vh] overflow-y-auto">
          <SuggestionsDetail
            analysis={analysis}
            analyzing={analyzing}
            patientId={patient.id}
            onRunAnalysis={onRunAnalysis}
          />
        </div>
      )}

      {/* Sticky decision panel */}
      <div className="sticky bottom-0 z-20 bg-white border-t-2 border-blue-200 shadow-lg">
        <div className="px-4 py-3 max-w-4xl mx-auto w-full space-y-3">
          {/* Suggestion line */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm text-gray-600 shrink-0">Recommandation:</span>
              {analysis?.suggestedOrientation ? (
                <Badge className={`text-xs ${orientationColors[analysis.suggestedOrientation] || 'bg-gray-500 text-white'}`}>
                  {orientationLabels[analysis.suggestedOrientation] || analysis.suggestedOrientation}
                </Badge>
              ) : (
                <span className="text-sm text-gray-400">--</span>
              )}
              {topPathology && (
                <span className="text-xs text-gray-500 truncate hidden md:inline">
                  ({topPathology.pathologyName} - {topPathology.confidence}%)
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRunAnalysis(true)}
              disabled={analyzing}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* ESI + Orientation row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* ESI buttons */}
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="text-xs text-gray-500 shrink-0">ESI:</span>
              <div className="flex gap-1">
                {ESI_LEVELS.map((esi) => (
                  <button
                    key={esi.level}
                    onClick={() => onESIChange(esi.level)}
                    className={`w-8 h-8 rounded-md border-2 font-bold text-sm transition-all ${
                      selectedESI === esi.level
                        ? `${esi.selectedBg} ${esi.borderColor} shadow-md`
                        : `${esi.bgColor} ${esi.borderColor} ${esi.textColor} hover:opacity-80`
                    } ${suggestedESI === esi.level && selectedESI !== esi.level ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  >
                    {esi.level}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation buttons */}
            <div className="flex items-center gap-1.5 flex-1">
              <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="text-xs text-gray-500 shrink-0">Orient.:</span>
              <div className="flex gap-1 flex-wrap">
                {availableOrientations.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onOrientationChange(opt.value)}
                    className={`px-2.5 py-1 rounded-md border-2 text-xs font-semibold transition-all ${
                      selectedOrientation === opt.value
                        ? `${opt.selectedBg} ${opt.borderColor} shadow-md`
                        : `${opt.bgColor} ${opt.borderColor} ${opt.color} hover:opacity-80`
                    } ${suggestion?.suggestion === opt.value && selectedOrientation !== opt.value ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Override reason */}
          {isOrientationOverride && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
              <input
                type="text"
                className="flex-1 px-3 py-1.5 border border-orange-300 rounded-md text-sm bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Raison du changement d'orientation..."
                value={overrideReason}
                onChange={(e) => onOverrideReasonChange(e.target.value)}
              />
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-blue-600"
            >
              {showDetails ? (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Masquer les details
                </>
              ) : (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Voir les details
                </>
              )}
            </Button>

            <Button
              onClick={onConfirm}
              disabled={!canConfirm || saving}
              className="min-w-[200px] bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Enregistrement...' : 'Confirmer et terminer'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
