import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface ExposureData {
  temperature?: number;
  hypothermia: boolean;
  hyperthermia: boolean;
  rash: boolean;
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
}

export function ExposureForm({ data, onChange, onSave, loading }: Props) {
  const updateField = <K extends keyof ExposureData>(field: K, value: ExposureData[K]) => {
    onChange({ ...data, [field]: value });
  };

  // Temperature color coding
  const getTempColor = (temp: number | undefined) => {
    if (temp === undefined) return 'bg-gray-100';
    if (temp < 35 || temp > 39) return 'bg-red-100 border-red-300';
    if (temp < 36 || temp > 38) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  // Auto-detect hypothermia/hyperthermia based on temperature
  React.useEffect(() => {
    if (data.temperature !== undefined) {
      if (data.temperature < 36 && !data.hypothermia) {
        updateField('hypothermia', true);
      } else if (data.temperature >= 36 && data.hypothermia) {
        updateField('hypothermia', false);
      }
      if (data.temperature > 38 && !data.hyperthermia) {
        updateField('hyperthermia', true);
      } else if (data.temperature <= 38 && data.hyperthermia) {
        updateField('hyperthermia', false);
      }
    }
  }, [data.temperature]);

  // Warning indicators
  const hasCritical =
    data.burns ||
    (data.temperature !== undefined && (data.temperature < 35 || data.temperature > 39));

  const hasWarnings =
    hasCritical ||
    data.wounds ||
    data.traumaSigns ||
    data.hypothermia ||
    data.hyperthermia ||
    (data.temperature !== undefined && (data.temperature < 36 || data.temperature > 38));

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

      {/* Temperature */}
      <div className={`space-y-2 p-4 rounded-lg border-2 ${getTempColor(data.temperature)}`}>
        <Label className="font-medium text-base">Temperature (°C)</Label>
        <div className="flex items-center gap-4">
          <Input
            type="number"
            step="0.1"
            value={data.temperature ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
              updateField('temperature', val as number);
            }}
            placeholder="Ex: 37.5"
            className="max-w-[150px] bg-white text-lg"
          />
          <span className="text-2xl font-bold text-gray-600">°C</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Normal: 36.1-37.8°C</span>
          <span className="text-red-500">&lt;35°C ou &gt;39°C = Critique</span>
        </div>
      </div>

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
