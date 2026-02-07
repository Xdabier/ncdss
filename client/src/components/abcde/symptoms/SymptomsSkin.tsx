import React from 'react';
import { Label } from '../../ui/label';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  selected?: string[];
  onChange: (selected: string[]) => void;
}

const SKIN_OPTIONS = [
  { value: 'paleur', label: 'Pâleur' },
  { value: 'cyanose', label: 'Cyanose' },
  { value: 'marbrures', label: 'Marbrures' },
  { value: 'sueurs_profuses', label: 'Sueurs profuses' },
  { value: 'extremites_froides', label: 'Extrémités froides' },
];

export function SymptomsSkin({ selected, onChange }: Props): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">Signes cutanés</Label>
      <MultiSelectCombobox
        options={SKIN_OPTIONS}
        selected={selected ?? []}
        onChange={onChange}
        placeholder="Sélectionner les signes cutanés..."
      />
    </div>
  );
}
