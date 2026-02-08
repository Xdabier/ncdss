import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface MedicalHistoryData {
  chiefComplaint?: string;
  symptomOnset?: string;
  allergies?: string;
  chronicConditions?: string[];
  currentMedications?: string[];
  surgicalHistory?: string;
  medicalHistoryNotes?: string;
  medicalHistory?: string;
  obstetricHistory?: string;
}

interface Props {
  data: Partial<MedicalHistoryData>;
  onChange: (data: Partial<MedicalHistoryData>) => void;
}

const chronicConditionOptions = [
  'Diabete', 'Hypertension', 'Asthme', 'BPCO', 'Insuffisance cardiaque',
  'Insuffisance renale', 'AVC', 'Epilepsie', 'Cancer', 'VIH/SIDA'
];

export function MedicalHistoryForm({ data, onChange }: Props): React.ReactElement {
  const [newMedication, setNewMedication] = useState('');

  const updateField = <K extends keyof MedicalHistoryData>(field: K, value: MedicalHistoryData[K]): void => {
    onChange({ ...data, [field]: value });
  };

  const toggleCondition = (condition: string): void => {
    const current = data.chronicConditions || [];
    if (current.includes(condition)) {
      updateField('chronicConditions', current.filter(c => c !== condition));
    } else {
      updateField('chronicConditions', [...current, condition]);
    }
  };

  const addMedication = (): void => {
    if (newMedication.trim()) {
      const current = data.currentMedications || [];
      updateField('currentMedications', [...current, newMedication.trim()]);
      setNewMedication('');
    }
  };

  const removeMedication = (index: number): void => {
    const current = data.currentMedications || [];
    updateField('currentMedications', current.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* 1. Antecedents medicaux */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-lg">Antecedents medicaux</h3>
        <div className="space-y-2">
          <Label htmlFor="medicalHistory">Antecedents medicaux</Label>
          <textarea
            id="medicalHistory"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={data.medicalHistory || ''}
            onChange={(e) => updateField('medicalHistory', e.target.value)}
            placeholder="Ex: Diabete type 2 depuis 2015, HTA traitee..."
            rows={3}
          />
        </div>
      </div>

      {/* 2. Antecedents chirurgicaux */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-lg">Antecedents chirurgicaux</h3>
        <div className="space-y-2">
          <Label htmlFor="surgicalHistory">Operations precedentes</Label>
          <textarea
            id="surgicalHistory"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={data.surgicalHistory || ''}
            onChange={(e) => updateField('surgicalHistory', e.target.value)}
            placeholder="Ex: Appendicectomie 2019, Prothese de hanche..."
            rows={2}
          />
        </div>
      </div>

      {/* 3. Antecedents obstetricaux */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-lg">Antecedents obstetricaux</h3>
        <div className="space-y-2">
          <Label htmlFor="obstetricHistory">Grossesses, accouchements, complications</Label>
          <textarea
            id="obstetricHistory"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={data.obstetricHistory || ''}
            onChange={(e) => updateField('obstetricHistory', e.target.value)}
            placeholder="Ex: G2P2, cesarienne 2020, pas de complications..."
            rows={2}
          />
        </div>
      </div>

      {/* 4. Allergies */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-lg">Allergies</h3>
        <div className="space-y-2">
          <Label htmlFor="allergies">Allergies connues</Label>
          <textarea
            id="allergies"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={data.allergies || ''}
            onChange={(e) => updateField('allergies', e.target.value)}
            placeholder="Ex: Penicilline, Aspirine, Latex..."
            rows={2}
          />
        </div>
      </div>

      {/* 5. Maladies & Conditions */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-lg">Maladies & Conditions</h3>

        {/* Chronic Conditions */}
        <div className="space-y-2">
          <Label>Maladies chroniques</Label>
          <div className="flex flex-wrap gap-2">
            {chronicConditionOptions.map(condition => (
              <Badge
                key={condition}
                variant={(data.chronicConditions || []).includes(condition) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/90"
                onClick={() => toggleCondition(condition)}
              >
                {condition}
              </Badge>
            ))}
          </div>
        </div>

        {/* Current Medications */}
        <div className="space-y-2">
          <Label>Medicaments en cours</Label>
          <div className="flex gap-2">
            <Input
              value={newMedication}
              onChange={e => setNewMedication(e.target.value)}
              placeholder="Nom du medicament"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMedication();
                }
              }}
            />
            <Button type="button" onClick={addMedication} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {(data.currentMedications || []).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(data.currentMedications || []).map((med, index) => (
                <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1">
                  {med}
                  <button
                    onClick={() => removeMedication(index)}
                    className="ml-1 rounded-full p-0.5 hover:bg-gray-200 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. Notes */}
      <div className="space-y-2">
        <Label htmlFor="medicalHistoryNotes">Notes</Label>
        <textarea
          id="medicalHistoryNotes"
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={data.medicalHistoryNotes || ''}
          onChange={(e) => updateField('medicalHistoryNotes', e.target.value)}
          placeholder="Notes supplementaires sur les antecedents du patient..."
          rows={3}
        />
      </div>
    </div>
  );
}
