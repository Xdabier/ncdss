import React, { useState } from 'react';
import { Label } from '../../ui/label';
import { MultiSelectCombobox } from '../../ui/MultiSelectCombobox';

interface Props {
  signesLutte?: string[];
  pauseRespiratoire?: boolean;
  onSignesLutteChange: (values: string[]) => void;
  onPauseChange: (value: boolean) => void;
}

const SIGNES_LUTTE_OPTIONS = [
  { value: 'tirage_sous_costal', label: 'Tirage sous-costal' },
  { value: 'muscles_accessoires', label: 'Muscles accessoires' },
  { value: 'balancement_thoraco_abdominal', label: 'Balancement thoraco-abdominal' },
  { value: 'battement_ailes_nez', label: 'Battement des ailes du nez' },
];

type WorkMode = 'signes_lutte' | 'pause' | undefined;

export function SymptomsWork({ signesLutte, pauseRespiratoire, onSignesLutteChange, onPauseChange }: Props): React.ReactElement {
  // Explicit mode tracks the user's radio selection so the MultiSelectCombobox
  // can be shown before any items are picked.
  const [explicitMode, setExplicitMode] = useState<WorkMode>(undefined);

  const derivedMode: WorkMode =
    (signesLutte && signesLutte.length > 0) ? 'signes_lutte' :
    pauseRespiratoire ? 'pause' :
    undefined;

  // Once props reflect the explicit selection, let derivation take over.
  if (explicitMode !== undefined && derivedMode === explicitMode) {
    setExplicitMode(undefined);
  }

  const currentMode = explicitMode ?? derivedMode;

  const handleModeChange = (mode: WorkMode): void => {
    setExplicitMode(mode);
    if (mode === 'signes_lutte') {
      onPauseChange(false);
    } else if (mode === 'pause') {
      onSignesLutteChange([]);
      onPauseChange(true);
    } else {
      onSignesLutteChange([]);
      onPauseChange(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Travail</Label>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="work_mode"
            checked={currentMode === 'signes_lutte'}
            onChange={() => handleModeChange('signes_lutte')}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm">Signes de lutte</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="work_mode"
            checked={currentMode === 'pause'}
            onChange={() => handleModeChange('pause')}
            className="h-4 w-4 text-primary focus:ring-primary"
          />
          <span className="text-sm">Pause respiratoire / silence auscultatoire</span>
        </label>
      </div>
      {currentMode === 'signes_lutte' && (
        <MultiSelectCombobox
          options={SIGNES_LUTTE_OPTIONS}
          selected={signesLutte ?? []}
          onChange={onSignesLutteChange}
          placeholder="Sélectionner les signes de lutte..."
        />
      )}
    </div>
  );
}
