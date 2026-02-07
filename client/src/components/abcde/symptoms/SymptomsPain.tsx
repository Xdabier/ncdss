import React from 'react';
import { Label } from '../../ui/label';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  selected?: string[];
  onChange: (selected: string[]) => void;
}

const PAIN_OPTIONS = [
  { value: 'thoracique', label: 'Thoracique' },
  { value: 'abdominale', label: 'Abdominale' },
  { value: 'cephalique', label: 'Céphalique' },
  { value: 'neurologique', label: 'Neurologique' },
  { value: 'orthopedique', label: 'Orthopédique' },
  { value: 'musculaire', label: 'Musculaire' },
  { value: 'membres_inf_sup', label: 'Membres inférieurs ou supérieurs' },
  { value: 'faciale', label: 'Faciale' },
  { value: 'buccale', label: 'Buccale' },
];

export function SymptomsPain({ selected, onChange }: Props): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">Douleurs</Label>
      <MultiSelectCombobox
        options={PAIN_OPTIONS}
        selected={selected ?? []}
        onChange={onChange}
        placeholder="Sélectionner les localisations..."
      />
    </div>
  );
}
