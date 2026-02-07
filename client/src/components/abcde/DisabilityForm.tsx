import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { ReadOnlyVitalBadge } from './ReadOnlyVitalBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { VitalsData } from './VitalsForm';

interface DisabilityData {
  pupils?: string;
  motorResponse?: string;
  seizures: boolean;
  confusion: boolean;
  headache?: boolean;
  notes?: string;
}

interface Props {
  data: Partial<DisabilityData>;
  onChange: (data: Partial<DisabilityData>) => void;
  onSave?: () => void;
  loading?: boolean;
  vitalsData?: Partial<VitalsData>;
  hideVitalBadges?: boolean;
  hideNotes?: boolean;
  hideGCSDisplay?: boolean;
}

export function DisabilityForm({ data, onChange, onSave, loading, vitalsData, hideVitalBadges, hideNotes, hideGCSDisplay }: Props) {
  const updateField = <K extends keyof DisabilityData>(field: K, value: DisabilityData[K]) => {
    onChange({ ...data, [field]: value });
  };

  // Calculate GCS total from vitalsData
  const gcsTotal = (vitalsData?.gcsEye || 0) + (vitalsData?.gcsVerbal || 0) + (vitalsData?.gcsMotor || 0);

  // GCS color coding
  const getGCSColor = (gcs: number) => {
    if (gcs === 0) return 'bg-gray-200 text-gray-600';
    if (gcs <= 8) return 'bg-red-500 text-white';
    if (gcs < 12) return 'bg-orange-500 text-white';
    if (gcs < 15) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  const getGlucoseColor = (glucose: number): string => {
    if (glucose < 60 || glucose > 300) return 'bg-red-100 text-red-800 border-red-300';
    if (glucose < 70 || glucose > 180) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  // Warning indicators
  const hasCritical =
    data.seizures ||
    data.pupils === 'unequal' ||
    data.pupils === 'fixed' ||
    data.motorResponse === 'paralysis' ||
    data.motorResponse === 'lateralized' ||
    (gcsTotal > 0 && gcsTotal <= 8) ||
    (vitalsData?.glucoseLevel !== undefined && (vitalsData.glucoseLevel! < 60 || vitalsData.glucoseLevel! > 300));

  const hasWarnings =
    hasCritical ||
    data.confusion ||
    data.pupils === 'dilated' ||
    data.motorResponse === 'weakness' ||
    (gcsTotal > 0 && gcsTotal < 15) ||
    (vitalsData?.glucoseLevel !== undefined && (vitalsData.glucoseLevel! < 70 || vitalsData.glucoseLevel! > 180));

  return (
    <div className="space-y-6">
      {!hideVitalBadges && (
        <div className="flex justify-between items-center">
          <h3 className="font-medium text-lg">D - Neurologique (Disability)</h3>
          {!hideGCSDisplay && gcsTotal > 0 && (
            <div className={`px-4 py-2 rounded-full font-bold text-lg ${getGCSColor(gcsTotal)}`}>
              GCS: {gcsTotal}/15
            </div>
          )}
        </div>
      )}

      {/* Critical warning banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm font-medium">
            Signes critiques detectes - Evaluation SAUV probable
          </p>
        </div>
      )}

      {/* Read-only vital badges from vitals tab */}
      {!hideVitalBadges && (vitalsData?.gcsEye != null || vitalsData?.glucoseLevel != null) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500">Depuis Vitaux:</span>
            <ReadOnlyVitalBadge label="Glycemie" value={vitalsData?.glucoseLevel} unit="mg/dL" getColor={getGlucoseColor} />
          </div>
          {gcsTotal > 0 && (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 border">
              <span className="text-sm text-gray-500">GCS:</span>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-center px-2 py-1 bg-white rounded border">
                  <div className="text-xs text-gray-500">E</div>
                  <div className="font-semibold">{vitalsData?.gcsEye || '--'}</div>
                </div>
                <div className="text-center px-2 py-1 bg-white rounded border">
                  <div className="text-xs text-gray-500">V</div>
                  <div className="font-semibold">{vitalsData?.gcsVerbal || '--'}</div>
                </div>
                <div className="text-center px-2 py-1 bg-white rounded border">
                  <div className="text-xs text-gray-500">M</div>
                  <div className="font-semibold">{vitalsData?.gcsMotor || '--'}</div>
                </div>
              </div>
              <span className="font-bold">{gcsTotal}/15</span>
            </div>
          )}
          {/* GCS interpretation */}
          {gcsTotal > 0 && (
            <div className={`p-2 rounded text-sm ${
              gcsTotal <= 8 ? 'bg-red-100 text-red-800' :
              gcsTotal < 12 ? 'bg-orange-100 text-orange-800' :
              gcsTotal < 15 ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {gcsTotal <= 8 ? 'Coma - Intubation a considerer' :
               gcsTotal < 12 ? 'Alteration severe de la conscience' :
               gcsTotal < 15 ? 'Alteration moderee de la conscience' :
               'Conscience normale'}
            </div>
          )}
        </div>
      )}

      {/* Neurological Assessment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Pupilles</Label>
          <Select
            value={data.pupils}
            onValueChange={(val) => updateField('pupils', val)}
          >
            <SelectTrigger className={
              data.pupils === 'unequal' || data.pupils === 'fixed' ? 'border-red-300 bg-red-50' :
              data.pupils === 'dilated' || data.pupils === 'constricted' ? 'border-yellow-300 bg-yellow-50' :
              data.pupils === 'PEARL' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PEARL">Reactives (PEARL)</SelectItem>
              <SelectItem value="dilated">Mydriase bilaterale</SelectItem>
              <SelectItem value="constricted">Myosis bilateral</SelectItem>
              <SelectItem value="unequal">Anisocorie (CRITIQUE)</SelectItem>
              <SelectItem value="fixed">Areactives (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Reponse Motrice Globale</Label>
          <Select
            value={data.motorResponse}
            onValueChange={(val) => updateField('motorResponse', val)}
          >
            <SelectTrigger className={
              data.motorResponse === 'paralysis' || data.motorResponse === 'lateralized' ? 'border-red-300 bg-red-50' :
              data.motorResponse === 'weakness' ? 'border-yellow-300 bg-yellow-50' :
              data.motorResponse === 'normal' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normale</SelectItem>
              <SelectItem value="weakness">Faiblesse</SelectItem>
              <SelectItem value="lateralized">Deficit lateralise (CRITIQUE)</SelectItem>
              <SelectItem value="paralysis">Paralysie (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clinical Signs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.seizures ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            checked={data.seizures || false}
            onChange={(e) => updateField('seizures', e.target.checked)}
          />
          <span className="font-medium text-sm text-red-600">Convulsions / Crise comitiale (CRITIQUE)</span>
        </label>

        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.confusion ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            checked={data.confusion || false}
            onChange={(e) => updateField('confusion', e.target.checked)}
          />
          <span className="font-medium text-sm text-orange-600">Confusion / Desorientation</span>
        </label>

        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.headache ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            checked={data.headache || false}
            onChange={(e) => updateField('headache', e.target.checked)}
          />
          <span className="font-medium text-sm text-red-600">Cephalees brutales severes (CRITIQUE)</span>
        </label>
      </div>

      {/* Status summary */}
      <div className={`p-3 rounded-md ${
        hasCritical ? 'bg-red-50 border border-red-200' :
        hasWarnings ? 'bg-orange-50 border border-orange-200' :
        'bg-green-50 border border-green-200'
      }`}>
        <p className={`text-sm font-medium ${
          hasCritical ? 'text-red-800' :
          hasWarnings ? 'text-orange-800' :
          'text-green-800'
        }`}>
          Etat neurologique: {
            hasCritical ? 'Deficit neurologique critique - Intervention immediate requise' :
            hasWarnings ? 'Anomalies detectees - Surveillance rapprochee' :
            'Examen neurologique normal'
          }
        </p>
      </div>

      {/* Notes */}
      {!hideNotes && (
        <div className="space-y-2">
          <Label>Notes & Observations</Label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={data.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Details supplementaires sur l'etat neurologique..."
          />
        </div>
      )}

      {!hideNotes && onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Valider et Continuer (E)'}
        </Button>
      )}
    </div>
  );
}
