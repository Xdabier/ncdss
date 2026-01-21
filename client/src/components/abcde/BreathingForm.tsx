import React, { useState, useEffect } from 'react';
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
import { getApi } from '@/services/api.ts';
import { InterventionChecklist } from './InterventionChecklist';

interface BreathingData {
  respiratoryRate: number;
  oxygenSaturation: number;
  breathSounds: string;
  workOfBreathing: string;
  cyanosis: boolean;
  interventions: string[];
  selectedSeveritySigns?: string[];
  selectedNursingInterventions?: string[];
  selectedMedicalInterventions?: string[];
  notes?: string;
}

interface Props {
  data: Partial<BreathingData>;
  onChange: (data: Partial<BreathingData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function BreathingForm({ data, onChange, onSave, loading }: Props) {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);

  const updateField = (field: keyof BreathingData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  useEffect(() => {
    const loadInterventions = async () => {
      try {
        const api = await getApi();
        const res = await api.get('/interventions?category=B');
        setInterventions(res.data);
      } catch (error) {
        console.error('Failed to load interventions:', error);
      } finally {
        setLoadingInterventions(false);
      }
    };
    loadInterventions();
  }, []);

  // Flatten all interventions into categories
  const allSeveritySigns = Array.from(
    new Set(interventions.flatMap(i => i.severitySigns || []))
  );
  const allNursingInterventions = Array.from(
    new Set(interventions.flatMap(i => i.nursingInterventions || []))
  );
  const allMedicalInterventions = Array.from(
    new Set(interventions.flatMap(i => i.medicalInterventions || []))
  );

  return (
    <div className="space-y-6">
      <h3 className="font-medium text-lg">Respiration (Breathing)</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Fréquence Respiratoire (mvts/min)</Label>
          <Input
            type="number"
            value={data.respiratoryRate || ''}
            onChange={e => updateField('respiratoryRate', parseInt(e.target.value))}
            placeholder="Ex: 16"
          />
        </div>

        <div className="space-y-2">
          <Label>Saturation O2 (%)</Label>
          <Input
            type="number"
            value={data.oxygenSaturation || ''}
            onChange={e => updateField('oxygenSaturation', parseInt(e.target.value))}
            placeholder="Ex: 98"
          />
        </div>

        <div className="space-y-2">
          <Label>Bruits Respiratoires</Label>
          <Select
            value={data.breathSounds}
            onValueChange={val => updateField('breathSounds', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normaux</SelectItem>
              <SelectItem value="decreased">Diminués</SelectItem>
              <SelectItem value="wheezing">Sibilants</SelectItem>
              <SelectItem value="crackles">Crépitants</SelectItem>
              <SelectItem value="absent">Absents</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Travail Respiratoire</Label>
          <Select
            value={data.workOfBreathing}
            onValueChange={val => updateField('workOfBreathing', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="increased">Augmenté</SelectItem>
              <SelectItem value="severe">Détresse sévère</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={data.cyanosis || false}
          onChange={e => updateField('cyanosis', e.target.checked)}
        />
        <span className="font-medium">Cyanose</span>
      </div>

      {loadingInterventions ? (
        <div className="text-center py-4 text-gray-500">
          Chargement des interventions...
        </div>
      ) : (
        <div className="space-y-6">
          <InterventionChecklist
            title="Signes de gravité"
            items={allSeveritySigns}
            selected={data.selectedSeveritySigns || []}
            onChange={signs => updateField('selectedSeveritySigns', signs)}
            colorClass="text-red-600"
          />

          <InterventionChecklist
            title="Interventions infirmières"
            items={allNursingInterventions}
            selected={data.selectedNursingInterventions || []}
            onChange={interventions => updateField('selectedNursingInterventions', interventions)}
            colorClass="text-blue-600"
          />

          <InterventionChecklist
            title="Interventions médicales"
            items={allMedicalInterventions}
            selected={data.selectedMedicalInterventions || []}
            onChange={interventions => updateField('selectedMedicalInterventions', interventions)}
            colorClass="text-green-600"
          />
        </div>
      )}

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
        {loading ? 'Enregistrement...' : 'Valider et Continuer (C)'}
      </Button>
    </div>
  );
}
