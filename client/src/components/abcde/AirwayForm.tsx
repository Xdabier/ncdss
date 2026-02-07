import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { ReadOnlyVitalBadge } from './ReadOnlyVitalBadge';
import type { VitalsData } from './VitalsForm';

interface AirwayData {
  patent: boolean;
  obstructed: boolean;
  secretions: boolean;
  stridor: boolean;
  drooling?: boolean;
  dysphagia?: boolean;
  notes?: string;
}

interface Props {
  data: Partial<AirwayData>;
  onChange: (data: Partial<AirwayData>) => void;
  onSave?: () => void;
  loading?: boolean;
  vitalsData?: Partial<VitalsData>;
}

export function AirwayForm({ data, onChange, onSave, loading, vitalsData }: Props) {
  const updateField = <K extends keyof AirwayData>(field: K, value: AirwayData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const getPainColor = (level: number): string => {
    if (level <= 3) return 'bg-green-100 text-green-800 border-green-300';
    if (level <= 6) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  // Warning indicators
  const hasWarnings = data.obstructed || data.stridor || !data.patent;
  const hasCritical = data.obstructed || data.stridor;

  return (
    <div className="space-y-6">
      {/* Read-only pain badge from vitals */}
      {vitalsData?.painLevel != null && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Depuis Vitaux:</span>
          <ReadOnlyVitalBadge
            label="Douleur"
            value={vitalsData.painLevel}
            unit="/10"
            getColor={getPainColor}
          />
        </div>
      )}

      {/* Airway Status */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">A - Voies aeriennes (Airway)</h3>

        {/* Warning banner */}
        {hasCritical && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-800 text-sm font-medium">
              Signes critiques detectes - Evaluation SAUV probable
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.patent ? 'bg-green-50 border-green-300' : 'hover:bg-gray-50'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
              checked={data.patent || false}
              onChange={(e) => updateField('patent', e.target.checked)}
            />
            <span className="font-medium text-sm">Libres</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.obstructed ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              checked={data.obstructed || false}
              onChange={(e) => updateField('obstructed', e.target.checked)}
            />
            <span className="font-medium text-sm text-red-600">Obstruees</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.secretions ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.secretions || false}
              onChange={(e) => updateField('secretions', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Secretions</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.stridor ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              checked={data.stridor || false}
              onChange={(e) => updateField('stridor', e.target.checked)}
            />
            <span className="font-medium text-sm text-red-600">Stridor</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.drooling ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.drooling || false}
              onChange={(e) => updateField('drooling', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Hypersalivation / Bave</span>
          </label>

          <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
            data.dysphagia ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
          }`}>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.dysphagia || false}
              onChange={(e) => updateField('dysphagia', e.target.checked)}
            />
            <span className="font-medium text-sm text-orange-600">Dysphagie</span>
          </label>
        </div>

        {/* Status summary */}
        <div className={`p-3 rounded-md ${
          hasWarnings ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'
        }`}>
          <p className={`text-sm font-medium ${hasWarnings ? 'text-orange-800' : 'text-green-800'}`}>
            Etat: {data.patent && !data.obstructed ? 'Voies aeriennes libres' :
                   data.obstructed ? 'Obstruction detectee' :
                   'A evaluer'}
            {data.stridor && ' - Stridor present'}
            {data.secretions && ' - Secretions presentes'}
          </p>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes & Observations</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes || ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Details supplementaires sur les voies aeriennes..."
        />
      </div>

      {onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Valider et Continuer (B)'}
        </Button>
      )}
    </div>
  );
}
