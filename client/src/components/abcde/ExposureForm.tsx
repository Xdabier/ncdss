import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { ReadOnlyVitalBadge } from './ReadOnlyVitalBadge';
import type { VitalsData } from './VitalsForm';

interface ExposureData {
  hypothermia: boolean;
  hyperthermia: boolean;
  rash: boolean;
  vomiting?: boolean;
  wounds: boolean;
  edema: boolean;
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
}

export function ExposureForm({ data, onChange, onSave, loading, vitalsData }: Props) {
  const updateField = <K extends keyof ExposureData>(field: K, value: ExposureData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const getTempColor = (temp: number): string => {
    if (temp < 35 || temp > 39) return 'bg-red-100 text-red-800 border-red-300';
    if (temp < 36 || temp > 38) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-green-100 text-green-800 border-green-300';
  };

  // Auto-detect hypothermia/hyperthermia based on vitalsData temperature
  React.useEffect(() => {
    if (vitalsData?.temperature !== undefined) {
      if (vitalsData.temperature < 36 && !data.hypothermia) {
        updateField('hypothermia', true);
      } else if (vitalsData.temperature >= 36 && data.hypothermia) {
        updateField('hypothermia', false);
      }
      if (vitalsData.temperature > 38 && !data.hyperthermia) {
        updateField('hyperthermia', true);
      } else if (vitalsData.temperature <= 38 && data.hyperthermia) {
        updateField('hyperthermia', false);
      }
    }
  }, [vitalsData?.temperature]);

  // Warning indicators using vitalsData for temperature thresholds
  const hasCritical =
    data.burns ||
    (vitalsData?.temperature !== undefined && (vitalsData.temperature! < 35 || vitalsData.temperature! > 39));

  const hasWarnings =
    hasCritical ||
    data.wounds ||
    data.traumaSigns ||
    data.hypothermia ||
    data.hyperthermia ||
    (vitalsData?.temperature !== undefined && (vitalsData.temperature! < 36 || vitalsData.temperature! > 38));

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">E - Exposition & Environnement</h3>

      {/* Critical warning banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm font-medium">
            Signes critiques detectes - Evaluation SAUV probable
          </p>
        </div>
      )}

      {/* Read-only temperature badge from vitals tab */}
      {vitalsData?.temperature != null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Depuis Vitaux:</span>
          <ReadOnlyVitalBadge label="T" value={vitalsData.temperature} unit="°C" getColor={getTempColor} />
        </div>
      )}

      {/* Temperature-related checkboxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.hypothermia ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-blue-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={data.hypothermia || false}
            onChange={(e) => updateField('hypothermia', e.target.checked)}
          />
          <span className="font-medium text-sm text-blue-600">Hypothermie (&lt;36°C)</span>
        </label>

        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.hyperthermia ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            checked={data.hyperthermia || false}
            onChange={(e) => updateField('hyperthermia', e.target.checked)}
          />
          <span className="font-medium text-sm text-red-600">Hyperthermie / Fievre (&gt;38°C)</span>
        </label>
      </div>

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
            data.edema ? 'bg-yellow-50 border-yellow-300' : 'hover:bg-gray-50'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
              checked={data.edema || false}
              onChange={(e) => updateField('edema', e.target.checked)}
            />
            <span className="font-medium text-sm">Oedeme</span>
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
        </div>
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

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes & Observations</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes || ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Description detaillee des lesions, localisation, etendue, contexte de survenue..."
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
