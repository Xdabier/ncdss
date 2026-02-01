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

interface BreathingData {
  breathSounds?: string;
  workOfBreathing?: string;
  cyanosis: boolean;
  accessoryMuscles: boolean;
  notes?: string;
}

interface Props {
  data: Partial<BreathingData>;
  onChange: (data: Partial<BreathingData>) => void;
  onSave?: () => void;
  loading?: boolean;
  vitalsData?: Partial<VitalsData>;
}

export function BreathingForm({ data, onChange, onSave, loading, vitalsData }: Props) {
  const updateField = <K extends keyof BreathingData>(field: K, value: BreathingData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const getRRColor = (rr: number): string => {
    if (rr < 8 || rr > 30) return 'bg-red-100 text-red-800 border-red-300';
    if (rr < 12 || rr > 24) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  const getSpO2Color = (spo2: number): string => {
    if (spo2 < 90) return 'bg-red-100 text-red-800 border-red-300';
    if (spo2 < 94) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  // Warning indicators using vitalsData for vital thresholds
  const hasCritical =
    data.cyanosis ||
    data.breathSounds === 'absent' ||
    data.workOfBreathing === 'severe' ||
    (vitalsData?.respiratoryRate !== undefined && (vitalsData.respiratoryRate! < 8 || vitalsData.respiratoryRate! > 30)) ||
    (vitalsData?.oxygenSaturation !== undefined && vitalsData.oxygenSaturation! < 90);

  const hasWarnings =
    hasCritical ||
    data.accessoryMuscles ||
    data.breathSounds === 'wheezing' ||
    data.breathSounds === 'crackles' ||
    data.workOfBreathing === 'increased' ||
    (vitalsData?.respiratoryRate !== undefined && (vitalsData.respiratoryRate! < 12 || vitalsData.respiratoryRate! > 24)) ||
    (vitalsData?.oxygenSaturation !== undefined && vitalsData.oxygenSaturation! < 94);

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">B - Respiration (Breathing)</h3>

      {/* Critical warning banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm font-medium">
            Signes critiques detectes - Evaluation SAUV probable
          </p>
        </div>
      )}

      {/* Read-only vital badges from vitals tab */}
      {(vitalsData?.respiratoryRate != null || vitalsData?.oxygenSaturation != null) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Depuis Vitaux:</span>
          <ReadOnlyVitalBadge label="FR" value={vitalsData?.respiratoryRate} unit="/min" getColor={getRRColor} />
          <ReadOnlyVitalBadge label="SpO2" value={vitalsData?.oxygenSaturation} unit="%" getColor={getSpO2Color} />
        </div>
      )}

      {/* Auscultation and Work of Breathing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Bruits Respiratoires</Label>
          <Select
            value={data.breathSounds}
            onValueChange={(val) => updateField('breathSounds', val)}
          >
            <SelectTrigger className={
              data.breathSounds === 'absent' ? 'border-red-300 bg-red-50' :
              data.breathSounds === 'wheezing' || data.breathSounds === 'crackles' ? 'border-yellow-300 bg-yellow-50' :
              data.breathSounds === 'normal' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normaux</SelectItem>
              <SelectItem value="decreased">Diminues</SelectItem>
              <SelectItem value="wheezing">Sibilants</SelectItem>
              <SelectItem value="crackles">Crepitants</SelectItem>
              <SelectItem value="absent">Absents (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Travail Respiratoire</Label>
          <Select
            value={data.workOfBreathing}
            onValueChange={(val) => updateField('workOfBreathing', val)}
          >
            <SelectTrigger className={
              data.workOfBreathing === 'severe' ? 'border-red-300 bg-red-50' :
              data.workOfBreathing === 'increased' ? 'border-yellow-300 bg-yellow-50' :
              data.workOfBreathing === 'normal' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="increased">Augmente (tirage)</SelectItem>
              <SelectItem value="severe">Detresse severe (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clinical Signs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.cyanosis ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            checked={data.cyanosis || false}
            onChange={(e) => updateField('cyanosis', e.target.checked)}
          />
          <span className="font-medium text-sm text-red-600">Cyanose (CRITIQUE)</span>
        </label>

        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.accessoryMuscles ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            checked={data.accessoryMuscles || false}
            onChange={(e) => updateField('accessoryMuscles', e.target.checked)}
          />
          <span className="font-medium text-sm text-orange-600">Muscles accessoires</span>
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
          Etat respiratoire: {
            hasCritical ? 'Detresse respiratoire - Intervention immediate requise' :
            hasWarnings ? 'Anomalies detectees - Surveillance rapprochee' :
            'Pas de signe de detresse'
          }
        </p>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes & Observations</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes || ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Details supplementaires sur la respiration..."
        />
      </div>

      {onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Valider et Continuer (C)'}
        </Button>
      )}
    </div>
  );
}
