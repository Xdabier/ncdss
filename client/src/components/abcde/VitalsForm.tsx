import React, { useMemo } from 'react';
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

export interface VitalsData {
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  systolicBP?: number;
  diastolicBP?: number;
  oxygenSaturation?: number;
  painLevel?: number;
  glucoseLevel?: number;
  gcsEye?: number;
  gcsVerbal?: number;
  gcsMotor?: number;
}

interface Props {
  data: Partial<VitalsData>;
  onChange: (data: Partial<VitalsData>) => void;
  onSave?: () => void;
  loading?: boolean;
}

export function VitalsForm({ data, onChange, onSave, loading }: Props) {
  const updateField = <K extends keyof VitalsData>(field: K, value: VitalsData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const gcsTotal = useMemo(() => {
    return (data.gcsEye || 0) + (data.gcsVerbal || 0) + (data.gcsMotor || 0);
  }, [data.gcsEye, data.gcsVerbal, data.gcsMotor]);

  // Color helpers
  const getTempColor = (temp: number | undefined) => {
    if (temp === undefined) return 'bg-gray-100';
    if (temp < 35 || temp > 39) return 'bg-red-100 border-red-300';
    if (temp < 36 || temp > 38) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getHRColor = (hr: number | undefined) => {
    if (hr === undefined) return 'bg-gray-100';
    if (hr < 50 || hr > 120) return 'bg-red-100 border-red-300';
    if (hr < 60 || hr > 100) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getRRColor = (rr: number | undefined) => {
    if (rr === undefined) return 'bg-gray-100';
    if (rr < 8 || rr > 30) return 'bg-red-100 border-red-300';
    if (rr < 12 || rr > 24) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getSpO2Color = (spo2: number | undefined) => {
    if (spo2 === undefined) return 'bg-gray-100';
    if (spo2 < 90) return 'bg-red-100 border-red-300';
    if (spo2 < 94) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getSystolicColor = (systolic: number | undefined) => {
    if (systolic === undefined) return 'bg-gray-100';
    if (systolic < 90 || systolic > 180) return 'bg-red-100 border-red-300';
    if (systolic < 100 || systolic > 140) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getPainColor = (pain: number | undefined) => {
    if (pain === undefined) return 'bg-gray-100';
    if (pain >= 7) return 'bg-red-100 border-red-300';
    if (pain >= 4) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getGlucoseColor = (glucose: number | undefined) => {
    if (glucose === undefined) return 'bg-gray-100';
    if (glucose < 60 || glucose > 300) return 'bg-red-100 border-red-300';
    if (glucose < 70 || glucose > 180) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getGCSColor = (gcs: number) => {
    if (gcs === 0) return 'bg-gray-200 text-gray-600';
    if (gcs <= 8) return 'bg-red-500 text-white';
    if (gcs < 12) return 'bg-orange-500 text-white';
    if (gcs < 15) return 'bg-yellow-500 text-black';
    return 'bg-green-500 text-white';
  };

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">Constantes Vitales</h3>

      {/* Core Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`space-y-2 p-3 rounded-lg border-2 ${getTempColor(data.temperature)}`}>
          <Label className="font-medium">Temperature (°C)</Label>
          <Input
            type="number"
            step="0.1"
            value={data.temperature ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
              updateField('temperature', val as number);
            }}
            placeholder="Ex: 37.0"
            className="bg-white"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Normal: 36.1-37.8°C</span>
            <span className="text-red-500">&lt;35 ou &gt;39 = Critique</span>
          </div>
        </div>

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
          <div className="flex justify-between text-xs text-gray-500">
            <span>Normal: 60-100 bpm</span>
            <span className="text-red-500">&lt;50 ou &gt;120 = Critique</span>
          </div>
        </div>

        <div className={`space-y-2 p-3 rounded-lg border-2 ${getRRColor(data.respiratoryRate)}`}>
          <Label className="font-medium">Frequence Respiratoire (/min)</Label>
          <Input
            type="number"
            value={data.respiratoryRate ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
              updateField('respiratoryRate', val as number);
            }}
            placeholder="Ex: 16"
            className="bg-white"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Normal: 12-20/min</span>
            <span className="text-red-500">&lt;8 ou &gt;30 = Critique</span>
          </div>
        </div>

        <div className={`space-y-2 p-3 rounded-lg border-2 ${getSpO2Color(data.oxygenSaturation)}`}>
          <Label className="font-medium">Saturation O2 (%)</Label>
          <Input
            type="number"
            value={data.oxygenSaturation ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : Math.min(100, Math.max(0, parseInt(e.target.value)));
              updateField('oxygenSaturation', val as number);
            }}
            placeholder="Ex: 98"
            className="bg-white"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Normal: &ge;95%</span>
            <span className="text-red-500">&lt;90% = Critique</span>
          </div>
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

      {/* Pain and Glucose */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`space-y-2 p-3 rounded-lg border-2 ${getPainColor(data.painLevel)}`}>
          <Label className="font-medium">Niveau de Douleur (EVA)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min="0"
              max="10"
              value={data.painLevel ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : Math.min(10, Math.max(0, parseInt(e.target.value)));
                updateField('painLevel', val as number);
              }}
              className="w-20 text-center text-lg font-bold bg-white"
              placeholder="0-10"
            />
            <span className="text-2xl font-bold text-gray-600">/10</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>0 = Pas de douleur</span>
            <span>10 = Douleur maximale</span>
          </div>
        </div>

        <div className={`space-y-2 p-3 rounded-lg border-2 ${getGlucoseColor(data.glucoseLevel)}`}>
          <Label className="font-medium">Glycemie Capillaire (mg/dL)</Label>
          <Input
            type="number"
            value={data.glucoseLevel ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseInt(e.target.value);
              updateField('glucoseLevel', val as number);
            }}
            placeholder="Ex: 100"
            className="bg-white"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Normal: 70-180 mg/dL</span>
            <span className="text-red-500">&lt;60 ou &gt;300 = Critique</span>
          </div>
        </div>
      </div>

      {/* Glasgow Coma Scale */}
      <div className="space-y-4 border p-4 rounded-md">
        <div className="flex justify-between items-center">
          <h4 className="font-medium text-sm">Score de Glasgow (GCS)</h4>
          <div className={`px-4 py-2 rounded-full font-bold text-lg ${getGCSColor(gcsTotal)}`}>
            GCS: {gcsTotal || '--'}/15
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Ouverture des yeux (E)</Label>
            <Select
              value={data.gcsEye?.toString()}
              onValueChange={(val) => updateField('gcsEye', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 - Spontanee</SelectItem>
                <SelectItem value="3">3 - A la demande</SelectItem>
                <SelectItem value="2">2 - A la douleur</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reponse verbale (V)</Label>
            <Select
              value={data.gcsVerbal?.toString()}
              onValueChange={(val) => updateField('gcsVerbal', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 - Orientee</SelectItem>
                <SelectItem value="4">4 - Confuse</SelectItem>
                <SelectItem value="3">3 - Inappropriee</SelectItem>
                <SelectItem value="2">2 - Incomprehensible</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reponse motrice (M)</Label>
            <Select
              value={data.gcsMotor?.toString()}
              onValueChange={(val) => updateField('gcsMotor', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 - A la commande</SelectItem>
                <SelectItem value="5">5 - Orientee a la douleur</SelectItem>
                <SelectItem value="4">4 - Evitement</SelectItem>
                <SelectItem value="3">3 - Decortication</SelectItem>
                <SelectItem value="2">2 - Decerebration</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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

      {onSave && (
        <Button onClick={onSave} disabled={loading} className="w-full" size="lg">
          {loading ? 'Enregistrement...' : 'Valider et Continuer'}
        </Button>
      )}
    </div>
  );
}
