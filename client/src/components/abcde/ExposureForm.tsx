import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { MultiSelectCombobox } from '../ui/MultiSelectCombobox';
import { ReadOnlyVitalBadge } from './ReadOnlyVitalBadge';
import type { VitalsData } from './VitalsForm';

export interface ExposureData {
  rash: boolean;
  vomiting?: boolean;
  diarrhea?: boolean;
  lastMeal?: string;
  wounds: boolean;
  edema: boolean;
  edemaType?: string[];
  burns: boolean;
  traumaSigns: boolean;
  findings?: string[];
  notes?: string;
}

interface Props {
  data: Partial<ExposureData>;
  onChange: (data: Partial<ExposureData>) => void;
  onSave?: () => void;
  loading?: boolean;
  vitalsData?: Partial<VitalsData>;
  hideVitalBadges?: boolean;
  /** @deprecated Notes are now always shown in this form. Kept for backward compatibility. */
  hideNotes?: boolean;
}

const edemaOptions = [
  { value: 'angioedeme', label: 'Angioedeme' },
  { value: 'membres_inferieurs_superieurs', label: 'Membres inferieurs ou superieurs' },
  { value: 'abdomen_ascite', label: 'Abdomen (ascite)' },
];

const lastMealOptions = [
  'Il y a 1h',
  'Il y a 2h',
  'Il y a 6h',
  'Il y a 12h',
  'Il y a 24h',
  'Il y a 2 jours+',
];

export function ExposureForm({ data, onChange, onSave, loading, vitalsData, hideVitalBadges }: Props) {
  const updateField = <K extends keyof ExposureData>(field: K, value: ExposureData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const getTempColor = (temp: number): string => {
    if (temp < 35 || temp > 39) return 'bg-red-100 text-red-800 border-red-300';
    if (temp < 36 || temp > 38) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  // Warning indicators using vitalsData for temperature thresholds
  const hasCritical =
    data.burns ||
    (vitalsData?.temperature !== undefined && (vitalsData.temperature! < 35 || vitalsData.temperature! > 39));

  const hasWarnings =
    hasCritical ||
    data.wounds ||
    data.traumaSigns ||
    (vitalsData?.temperature !== undefined && (vitalsData.temperature! < 36 || vitalsData.temperature! > 38));

  return (
    <div className="space-y-6">
      {!hideVitalBadges && <h3 className="font-medium text-lg">E - Exposition & Environnement</h3>}

      {/* Critical warning banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm font-medium">
            Signes critiques detectes - Evaluation SAUV probable
          </p>
        </div>
      )}

      {/* Read-only temperature badge from vitals tab */}
      {!hideVitalBadges && vitalsData?.temperature != null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Depuis Vitaux:</span>
          <ReadOnlyVitalBadge label="T" value={vitalsData.temperature} unit="°C" getColor={getTempColor} />
        </div>
      )}

      {/* Physical Examination Findings */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm text-gray-700">Examen physique</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.burns ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              checked={data.burns || false}
              onChange={(e) => updateField('burns', e.target.checked)}
            />
            <span className="font-medium text-sm text-red-600">Brulures (CRITIQUE)</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.traumaSigns ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.traumaSigns || false}
              onChange={(e) => updateField('traumaSigns', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Signes de traumatisme</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.wounds ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.wounds || false}
              onChange={(e) => updateField('wounds', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Plaies / Blessures</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.rash ? 'bg-yellow-50 border-yellow-300' : 'hover:bg-gray-50'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
              checked={data.rash || false}
              onChange={(e) => updateField('rash', e.target.checked)}
            />
            <span className="font-medium text-sm">Eruption cutanee / Rash</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.vomiting ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.vomiting || false}
              onChange={(e) => updateField('vomiting', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Vomissements</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.diarrhea ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.diarrhea || false}
              onChange={(e) => updateField('diarrhea', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Diarrhee</span>
          </label>
        </div>
      </div>

      {/* Oedeme - MultiSelect */}
      <div className="space-y-2">
        <Label className="font-medium text-sm">Oedeme</Label>
        <MultiSelectCombobox
          options={edemaOptions}
          selected={data.edemaType || []}
          onChange={(selected) => {
            onChange({
              ...data,
              edemaType: selected,
              edema: selected.length > 0,
            });
          }}
          placeholder="Selectionner le type d'oedeme..."
          searchable={false}
        />
      </div>

      {/* Dernier repas */}
      <div className="space-y-2">
        <Label className="font-medium text-sm">Dernier repas</Label>
        <Select
          value={data.lastMeal || ''}
          onValueChange={(val) => updateField('lastMeal', val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selectionner..." />
          </SelectTrigger>
          <SelectContent>
            {lastMealOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          Exposition: {
            hasCritical ? 'Lesions critiques detectees - Intervention immediate requise' :
            hasWarnings ? 'Anomalies detectees - Examen approfondi necessaire' :
            'Pas de signe anormal a l\'exposition'
          }
        </p>
      </div>

      {/* Notes - always shown */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes || ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Notes sur l'etat general du patient..."
        />
      </div>

      {onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Terminer Evaluation ABCDE'}
        </Button>
      )}
    </div>
  );
}
