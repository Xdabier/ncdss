import React from 'react';
import { Label } from '../../ui/label';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  selected?: string[];
  onChange: (selected: string[]) => void;
}

const TRAUMA_OPTIONS = [
  { value: 'cranien', label: 'Crânien' },
  { value: 'maxilo_facial', label: 'Maxilo-facial' },
  { value: 'thoracique', label: 'Thoracique' },
  { value: 'pelvien', label: 'Pelvien' },
  { value: 'membres_inf_sup', label: 'Membres inf ou sup' },
  { value: 'medullaire', label: 'Médullaire' },
];

export function SymptomsTrauma({ selected, onChange }: Props): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">Traumatisme</Label>
      <MultiSelectCombobox
        options={TRAUMA_OPTIONS}
        selected={selected ?? []}
        onChange={onChange}
        placeholder="Sélectionner les types de traumatisme..."
      />
    </div>
  );
}
