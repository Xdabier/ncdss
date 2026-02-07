import React from 'react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { Patient } from '@ncdss/shared';
import type { VitalsData } from '../abcde/VitalsForm';

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

interface ScoreBarProps {
  patient: Patient;
  vitalsData?: Partial<VitalsData>;
}

export function ScoreBar({ patient, vitalsData }: ScoreBarProps): React.ReactElement {
  // Compute live GCS from local vitals if available (before server save)
  const liveGCS = vitalsData?.gcsEye && vitalsData?.gcsVerbal && vitalsData?.gcsMotor
    ? (vitalsData.gcsEye + vitalsData.gcsVerbal + vitalsData.gcsMotor)
    : null;

  const displayGCS = patient.gcsScore ?? liveGCS;
  const displayPain = patient.painLevel ?? vitalsData?.painLevel;

  return (
    <div className="px-4 pb-2 flex flex-wrap gap-2">
      <Badge className={cn('text-xs', getNewsColor(patient.newsScore))}>
        NEWS: {patient.newsScore ?? '--'}
      </Badge>
      <Badge className={cn('text-xs', getGcsColor(displayGCS))}>
        GCS: {displayGCS ?? '--'}/15
      </Badge>
      <Badge className={cn('text-xs', getQsofaColor(patient.qsofaScore))}>
        qSOFA: {patient.qsofaScore ?? '--'}
      </Badge>
      {displayPain != null && (
        <Badge variant="outline" className="text-xs">
          Douleur: {displayPain}/10
        </Badge>
      )}
    </div>
  );
}
