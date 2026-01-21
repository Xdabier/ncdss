import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { getApi } from '@/services/api.ts';
import { InterventionChecklist } from './InterventionChecklist';

interface AirwayData {
  patent: boolean;
  obstructed: boolean;
  secretions: boolean;
  stridor: boolean;
  interventions: string[];
  selectedSeveritySigns?: string[];
  selectedNursingInterventions?: string[];
  selectedMedicalInterventions?: string[];
  notes?: string;
}

interface Props {
  data: Partial<AirwayData>;
  onChange: (data: Partial<AirwayData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function AirwayForm({ data, onChange, onSave, loading }: Props) {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);

  const updateField = (field: keyof AirwayData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  useEffect(() => {
    const loadInterventions = async () => {
      try {
        const api = await getApi();
        const res = await api.get('/interventions?category=A');
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
      <div className="space-y-4">
        <h3 className="font-medium text-lg">État des voies aériennes (Airway)</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={data.patent || false}
              onChange={e => updateField('patent', e.target.checked)}
            />
            <span className="font-medium">Libres (Patent)</span>
          </label>
          
          <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              checked={data.obstructed || false}
              onChange={e => updateField('obstructed', e.target.checked)}
            />
            <span className="font-medium text-red-600">Obstruées</span>
          </label>

          <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.secretions || false}
              onChange={e => updateField('secretions', e.target.checked)}
            />
            <span className="font-medium text-orange-600">Sécrétions</span>
          </label>

          <label className="flex items-center space-x-3 border p-4 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              checked={data.stridor || false}
              onChange={e => updateField('stridor', e.target.checked)}
            />
            <span className="font-medium text-orange-600">Stridor</span>
          </label>
        </div>
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
        {loading ? 'Enregistrement...' : 'Valider et Continuer (B)'}
      </Button>
    </div>
  );
}
