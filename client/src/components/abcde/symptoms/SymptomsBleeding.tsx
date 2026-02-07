import React from 'react';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  interne?: boolean;
  exteriorisee?: boolean;
  types?: string[];
  onInterneChange: (value: boolean) => void;
  onExterioriseeChange: (value: boolean) => void;
  onTypesChange: (types: string[]) => void;
}

const EXTERIORISEE_OPTIONS = [
  { value: 'epistaxis', label: 'Épistaxis' },
  { value: 'hemoptysie', label: 'Hémoptysie' },
  { value: 'hematemese', label: 'Hématémèse' },
  { value: 'gingivorragie', label: 'Gingivorragie' },
  { value: 'melena_rectorragie', label: 'Méléna/rectorragie' },
  { value: 'hematurie', label: 'Hématurie' },
  { value: 'otorragie', label: 'Otorragie' },
  { value: 'rhinorragie', label: 'Rhinorragie' },
  { value: 'metrorragie', label: 'Métrorragie' },
  { value: 'hemorragie_oculaire', label: 'Hémorragie oculaire' },
];

export function SymptomsBleeding({
  interne,
  exteriorisee,
  types,
  onInterneChange,
  onExterioriseeChange,
  onTypesChange,
}: Props): React.ReactElement {
  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Saignement</Label>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={interne ?? false}
            onCheckedChange={onInterneChange}
          />
          <span className="text-sm">Interne</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={exteriorisee ?? false}
            onCheckedChange={(checked) => {
              onExterioriseeChange(checked);
              if (!checked) onTypesChange([]);
            }}
          />
          <span className="text-sm">Extériorisée</span>
        </label>
      </div>
      {exteriorisee && (
        <MultiSelectCombobox
          options={EXTERIORISEE_OPTIONS}
          selected={types ?? []}
          onChange={onTypesChange}
          placeholder="Sélectionner les types de saignement..."
        />
      )}
    </div>
  );
}
