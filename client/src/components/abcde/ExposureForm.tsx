import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface ExposureData {
  temperature: number;
  rash: boolean;
  wounds: boolean;
  edema: boolean;
  findings: string[];
  interventions: string[];
  notes?: string;
}

interface Props {
  data: Partial<ExposureData>;
  onChange: (data: Partial<ExposureData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function ExposureForm({ data, onChange, onSave, loading }: Props) {
  const updateField = (field: keyof ExposureData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">Exposition & Environnement</h3>

      <div className="space-y-2">
        <Label>Température (°C)</Label>
        <Input
          type="number"
          step="0.1"
          value={data.temperature || ''}
          onChange={e => updateField('temperature', parseFloat(e.target.value))}
          placeholder="Ex: 37.5"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={data.rash || false}
            onChange={e => updateField('rash', e.target.checked)}
          />
          <span className="font-medium">Éruption cutanée</span>
        </label>
        
        <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={data.wounds || false}
            onChange={e => updateField('wounds', e.target.checked)}
          />
          <span className="font-medium">Plaies / Blessures</span>
        </label>

        <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={data.edema || false}
            onChange={e => updateField('edema', e.target.checked)}
          />
          <span className="font-medium">Œdème</span>
        </label>
      </div>

      <div className="space-y-2">
        <Label>Notes & Observations</Label>
        <textarea
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes || ''}
          onChange={e => updateField('notes', e.target.value)}
          placeholder="Détails supplémentaires..."
        />
      </div>

      <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
        {loading ? 'Enregistrement...' : 'Terminer Évaluation'}
      </Button>
    </div>
  );
}
