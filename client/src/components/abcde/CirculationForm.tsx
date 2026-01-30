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
  heartRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  capillaryRefill?: number;
  skinColor?: string;
  peripheralPulses?: string;
  bleeding: boolean;
  coldExtremities: boolean;
  notes?: string;
}

interface Props {
  data: Partial<CirculationData>;
  onChange: (data: Partial<CirculationData>) => void;
  onSave?: () => void;
  loading?: boolean;
}

export function CirculationForm({ data, onChange, onSave, loading }: Props) {
  const updateField = <K extends keyof CirculationData>(field: K, value: CirculationData[K]) => {
    onChange({ ...data, [field]: value });
  };

  // Determine status colors based on values
  const getHRColor = (hr: number | undefined) => {
    if (hr === undefined) return 'bg-gray-100';
    if (hr < 50 || hr > 120) return 'bg-red-100 border-red-300';
    if (hr < 60 || hr > 100) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getSystolicColor = (systolic: number | undefined) => {
    if (systolic === undefined) return 'bg-gray-100';
    if (systolic < 90 || systolic > 180) return 'bg-red-100 border-red-300';
    if (systolic < 100 || systolic > 140) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getTRCColor = (trc: number | undefined) => {
    if (trc === undefined) return 'bg-gray-100';
    if (trc > 3) return 'bg-red-100 border-red-300';
    if (trc > 2) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  // Warning indicators
  const hasCritical =
    data.bleeding ||
    data.skinColor === 'mottled' ||
    data.skinColor === 'cyanotic' ||
    data.peripheralPulses === 'absent' ||
    (data.heartRate !== undefined && (data.heartRate < 50 || data.heartRate > 120)) ||
    (data.systolicBP !== undefined && (data.systolicBP < 90 || data.systolicBP > 180));

  const hasWarnings =
    hasCritical ||
    data.coldExtremities ||
    data.skinColor === 'pale' ||
    data.peripheralPulses === 'weak' ||
    (data.capillaryRefill !== undefined && data.capillaryRefill > 3) ||
    (data.heartRate !== undefined && (data.heartRate < 60 || data.heartRate > 100)) ||
    (data.systolicBP !== undefined && (data.systolicBP < 100 || data.systolicBP > 140));

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">C - Circulation</h3>

      {/* Critical warning banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm font-medium">
            Signes critiques detectes - Evaluation SAUV probable
          </p>
        </div>
      )}

      {/* Vital Signs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`space-y-2 p-3 rounded-lg border-2 ${getHRColor(data.heartRate)}`}>
          <Label className="font-medium">Frequence Cardiaque (bpm)</Label>
          <Input
            type="number"
            value={data.heartRate ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
              updateField('heartRate', val as number);
            }}
            placeholder="Ex: 80"
            className="bg-white"
          />
          <div className="text-xs text-gray-500">Normal: 60-100 bpm</div>
        </div>

        <div className={`space-y-2 p-3 rounded-lg border-2 ${getSystolicColor(data.systolicBP)}`}>
          <Label className="font-medium">PAS (mmHg)</Label>
          <Input
            type="number"
            value={data.systolicBP ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
              updateField('systolicBP', val as number);
            }}
            placeholder="Ex: 120"
            className="bg-white"
          />
          <div className="text-xs text-gray-500">Normal: 100-140 mmHg</div>
        </div>

        <div className="space-y-2 p-3 rounded-lg border-2 bg-gray-100">
          <Label className="font-medium">PAD (mmHg)</Label>
          <Input
            type="number"
            value={data.diastolicBP ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
              updateField('diastolicBP', val as number);
            }}
            placeholder="Ex: 80"
            className="bg-white"
          />
          <div className="text-xs text-gray-500">Normal: 60-90 mmHg</div>
        </div>
      </div>

      {/* Perfusion Assessment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`space-y-2 p-3 rounded-lg border-2 ${getTRCColor(data.capillaryRefill)}`}>
          <Label className="font-medium">Temps de Recoloration Cutanee (sec)</Label>
          <Input
            type="number"
            step="0.5"
            value={data.capillaryRefill ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
              updateField('capillaryRefill', val as number);
            }}
            placeholder="Ex: 2"
            className="bg-white"
          />
          <div className="text-xs text-gray-500">Normal: &le;2 sec | &gt;3 = Hypoperfusion</div>
        </div>

        <div className="space-y-2">
          <Label>Couleur de la peau</Label>
          <Select
            value={data.skinColor}
            onValueChange={(val) => updateField('skinColor', val)}
          >
            <SelectTrigger className={
              data.skinColor === 'mottled' || data.skinColor === 'cyanotic' ? 'border-red-300 bg-red-50' :
              data.skinColor === 'pale' ? 'border-yellow-300 bg-yellow-50' :
              data.skinColor === 'normal' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normale</SelectItem>
              <SelectItem value="pale">Pale</SelectItem>
              <SelectItem value="cyanotic">Cyanosee (CRITIQUE)</SelectItem>
              <SelectItem value="mottled">Marbree (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Pouls peripheriques</Label>
          <Select
            value={data.peripheralPulses}
            onValueChange={(val) => updateField('peripheralPulses', val)}
          >
            <SelectTrigger className={
              data.peripheralPulses === 'absent' ? 'border-red-300 bg-red-50' :
              data.peripheralPulses === 'weak' ? 'border-yellow-300 bg-yellow-50' :
              data.peripheralPulses === 'strong' ? 'border-green-300 bg-green-50' : ''
            }>
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strong">Bien percus</SelectItem>
              <SelectItem value="weak">Filants</SelectItem>
              <SelectItem value="absent">Absents (CRITIQUE)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clinical Signs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.bleeding ? 'bg-red-50 border-red-300' : 'hover:bg-gray-50 border-red-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
            checked={data.bleeding || false}
            onChange={(e) => updateField('bleeding', e.target.checked)}
          />
          <span className="font-medium text-sm text-red-600">Saignement actif / Hemorragie (CRITIQUE)</span>
        </label>

        <label className={`flex items-center space-x-3 border p-3 rounded-md cursor-pointer transition-colors ${
          data.coldExtremities ? 'bg-orange-50 border-orange-300' : 'hover:bg-gray-50 border-orange-200'
        }`}>
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            checked={data.coldExtremities || false}
            onChange={(e) => updateField('coldExtremities', e.target.checked)}
          />
          <span className="font-medium text-sm text-orange-600">Extremites froides</span>
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
          Etat circulatoire: {
            hasCritical ? 'Instabilite hemodynamique - Intervention immediate requise' :
            hasWarnings ? 'Anomalies detectees - Surveillance rapprochee' :
            'Hemodynamique stable'
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
          placeholder="Details supplementaires sur la circulation..."
        />
      </div>

      {onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Valider et Continuer (D)'}
        </Button>
      )}
    </div>
  );
}
