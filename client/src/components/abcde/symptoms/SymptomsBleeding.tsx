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
  const interneId = React.useId();
  const exterioriseeId = React.useId();

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Saignement</Label>
      <div className="flex items-center gap-6">
        <label htmlFor={interneId} className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            id={interneId}
            checked={interne ?? false}
            onCheckedChange={(checked) => onInterneChange(checked === true)}
          />
          <span className="text-sm">Interne</span>
        </label>
        <label htmlFor={exterioriseeId} className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            id={exterioriseeId}
            checked={exteriorisee ?? false}
            onCheckedChange={(checked) => {
              const val = checked === true;
              onExterioriseeChange(val);
              if (!val) onTypesChange([]);
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
