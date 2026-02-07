import React from 'react';
import { Label } from '../../ui/label';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  normal?: boolean;
  details?: string[];
  onNormalChange: (normal: boolean) => void;
  onDetailsChange: (details: string[]) => void;
}

const ABNORMAL_OPTIONS = [
  { value: 'stridor', label: 'Stridor' },
  { value: 'murmurs', label: 'Murmurs' },
  { value: 'gasp', label: 'Gasp' },
  { value: 'ronflements', label: 'Ronflements' },
  { value: 'gargouillis', label: 'Gargouillis' },
  { value: 'sifflements', label: 'Sifflements' },
  { value: 'sibilants', label: 'Sibilants' },
  { value: 'rales_crepitants', label: 'Râles crépitants' },
];

export function SymptomsAuscultation({ normal, details, onNormalChange, onDetailsChange }: Props): React.ReactElement {
  const handleRadioChange = (isNormal: boolean): void => {
    onNormalChange(isNormal);
    if (isNormal) {
      onDetailsChange([]);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Auscultation (bruits respiratoires)</Label>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="auscultation"
            checked={normal === true}
            onChange={() => handleRadioChange(true)}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm">Normal</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="auscultation"
            checked={normal === false}
            onChange={() => handleRadioChange(false)}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm">Anormaux</span>
        </label>
      </div>
      {normal === false && (
        <MultiSelectCombobox
          options={ABNORMAL_OPTIONS}
          selected={details ?? []}
          onChange={onDetailsChange}
          placeholder="Sélectionner les bruits anormaux..."
        />
      )}
    </div>
  );
}
