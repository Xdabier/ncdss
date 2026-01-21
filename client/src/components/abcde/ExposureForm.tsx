import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getApi } from '@/services/api.ts';
import { InterventionChecklist } from './InterventionChecklist';

interface ExposureData {
  temperature: number;
  rash: boolean;
  wounds: boolean;
  edema: boolean;
  findings: string[];
  interventions: string[];
  selectedSeveritySigns?: string[];
  selectedNursingInterventions?: string[];
  selectedMedicalInterventions?: string[];
  notes?: string;
}

interface Props {
  data: Partial<ExposureData>;
  onChange: (data: Partial<ExposureData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function ExposureForm({ data, onChange, onSave, loading }: Props) {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);

  const updateField = (field: keyof ExposureData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  useEffect(() => {
    const loadInterventions = async () => {
      try {
        const api = await getApi();
        const res = await api.get('/interventions?category=E');
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
        {loading ? 'Enregistrement...' : 'Terminer Évaluation'}
      </Button>
    </div>
  );
}
