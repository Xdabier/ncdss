import React from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

interface CirculationData {
  heartRate: number;
  bloodPressure: string;
  capillaryRefill: number;
  skinColor: string;
  peripheralPulses: string;
  bleeding: boolean;
  interventions: string[];
  notes?: string;
}

interface Props {
  data: Partial<CirculationData>;
  onChange: (data: Partial<CirculationData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function CirculationForm({ data, onChange, onSave, loading }: Props) {
  const updateField = (field: keyof CirculationData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">Circulation</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Fréquence Cardiaque (bpm)</Label>
          <Input
            type="number"
            value={data.heartRate || ''}
            onChange={e => updateField('heartRate', parseInt(e.target.value))}
            placeholder="Ex: 80"
          />
        </div>

        <div className="space-y-2">
          <Label>Pression Artérielle (mmHg)</Label>
          <Input
            value={data.bloodPressure || ''}
            onChange={e => updateField('bloodPressure', e.target.value)}
            placeholder="Ex: 120/80"
          />
        </div>

        <div className="space-y-2">
          <Label>Temps de recoloration cutanée (sec)</Label>
          <Input
            type="number"
            value={data.capillaryRefill || ''}
            onChange={e => updateField('capillaryRefill', parseInt(e.target.value))}
            placeholder="Ex: 2"
          />
        </div>

        <div className="space-y-2">
          <Label>Couleur de la peau</Label>
          <Select
            value={data.skinColor}
            onValueChange={val => updateField('skinColor', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normale</SelectItem>
              <SelectItem value="pale">Pâle</SelectItem>
              <SelectItem value="cyanotic">Cyanosée</SelectItem>
              <SelectItem value="mottled">Marbrée</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Pouls périphériques</Label>
          <Select
            value={data.peripheralPulses}
            onValueChange={val => updateField('peripheralPulses', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strong">Bien perçus</SelectItem>
              <SelectItem value="weak">Filants</SelectItem>
              <SelectItem value="absent">Absents</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
          checked={data.bleeding || false}
          onChange={e => updateField('bleeding', e.target.checked)}
        />
        <span className="font-medium text-red-600">Saignement actif</span>
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
        {loading ? 'Enregistrement...' : 'Valider et Continuer (D)'}
      </Button>
    </div>
  );
}
