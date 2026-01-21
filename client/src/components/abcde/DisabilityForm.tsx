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

interface DisabilityData {
  gcsEye: number;
  gcsVerbal: number;
  gcsMotor: number;
  pupils: string;
  motorResponse: string;
  glucoseLevel?: number;
  interventions: string[];
  selectedSeveritySigns?: string[];
  selectedNursingInterventions?: string[];
  selectedMedicalInterventions?: string[];
  notes?: string;
}

interface Props {
  data: Partial<DisabilityData>;
  onChange: (data: Partial<DisabilityData>) => void;
  onSave: () => void;
  loading?: boolean;
}

export function DisabilityForm({ data, onChange, onSave, loading }: Props) {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(true);

  const updateField = (field: keyof DisabilityData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  useEffect(() => {
    const loadInterventions = async () => {
      try {
        const api = await getApi();
        const res = await api.get('/interventions?category=D');
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

  const gcsTotal = (data.gcsEye || 0) + (data.gcsVerbal || 0) + (data.gcsMotor || 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-lg">Neurologique (Disability)</h3>
        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold">
          Score GCS: {gcsTotal}/15
        </div>
      </div>

      <div className="space-y-4 border p-4 rounded-md">
        <h4 className="font-medium">Score de Glasgow (GCS)</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Ouverture des yeux (E)</Label>
            <Select
              value={data.gcsEye?.toString()}
              onValueChange={val => updateField('gcsEye', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 - Spontanée</SelectItem>
                <SelectItem value="3">3 - À la demande</SelectItem>
                <SelectItem value="2">2 - À la douleur</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Réponse verbale (V)</Label>
            <Select
              value={data.gcsVerbal?.toString()}
              onValueChange={val => updateField('gcsVerbal', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 - Orientée</SelectItem>
                <SelectItem value="4">4 - Confuse</SelectItem>
                <SelectItem value="3">3 - Inappropriée</SelectItem>
                <SelectItem value="2">2 - Incompréhensible</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Réponse motrice (M)</Label>
            <Select
              value={data.gcsMotor?.toString()}
              onValueChange={val => updateField('gcsMotor', parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 - À la commande</SelectItem>
                <SelectItem value="5">5 - Orientée à la douleur</SelectItem>
                <SelectItem value="4">4 - Évitement</SelectItem>
                <SelectItem value="3">3 - Décortication</SelectItem>
                <SelectItem value="2">2 - Décérébration</SelectItem>
                <SelectItem value="1">1 - Nulle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>Pupilles</Label>
          <Select
            value={data.pupils}
            onValueChange={val => updateField('pupils', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PEARL">Réactives (PEARL)</SelectItem>
              <SelectItem value="unequal">Anisocorie</SelectItem>
              <SelectItem value="dilated">Mydriase</SelectItem>
              <SelectItem value="constricted">Myosis</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Réponse Motrice Globale</Label>
          <Select
            value={data.motorResponse}
            onValueChange={val => updateField('motorResponse', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normale</SelectItem>
              <SelectItem value="weakness">Faiblesse</SelectItem>
              <SelectItem value="paralysis">Paralysie</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Glycémie Capillaire (g/L)</Label>
          <Input
            type="number"
            step="0.01"
            value={data.glucoseLevel || ''}
            onChange={e => updateField('glucoseLevel', parseFloat(e.target.value))}
            placeholder="Ex: 1.10"
          />
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
        {loading ? 'Enregistrement...' : 'Valider et Continuer (E)'}
      </Button>
    </div>
  );
}
