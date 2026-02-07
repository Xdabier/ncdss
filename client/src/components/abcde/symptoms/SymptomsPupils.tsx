import React from 'react';
import { Label } from '../../ui/label';

interface Props {
  size?: string;
  symmetry?: string;
  reactivity?: boolean;
  onSizeChange: (value: string | undefined) => void;
  onSymmetryChange: (value: string | undefined) => void;
  onReactivityChange: (value: boolean | undefined) => void;
}

export function SymptomsPupils({
  size,
  symmetry,
  reactivity,
  onSizeChange,
  onSymmetryChange,
  onReactivityChange,
}: Props): React.ReactElement {
  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Pupilles</Label>

      {/* Taille */}
      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Taille</span>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_size"
              checked={size === 'dilate'}
              onChange={() => onSizeChange('dilate')}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Dilaté</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_size"
              checked={size === 'constricte'}
              onChange={() => onSizeChange('constricte')}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Constricté</span>
          </label>
          <button
            type="button"
            onClick={() => onSizeChange(undefined)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Symétrie */}
      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Symétrie</span>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_symmetry"
              checked={symmetry === 'symetrique'}
              onChange={() => onSymmetryChange('symetrique')}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Symétrique</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_symmetry"
              checked={symmetry === 'asymetrique'}
              onChange={() => onSymmetryChange('asymetrique')}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Asymétrique</span>
          </label>
          <button
            type="button"
            onClick={() => onSymmetryChange(undefined)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Réactivité */}
      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Réactivité à la lumière</span>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_reactivity"
              checked={reactivity === true}
              onChange={() => onReactivityChange(true)}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Réactive</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pupil_reactivity"
              checked={reactivity === false}
              onChange={() => onReactivityChange(false)}
              className="h-4 w-4 text-primary focus:ring-primary"
            />
            <span className="text-sm">Non réactive</span>
          </label>
          <button
            type="button"
            onClick={() => onReactivityChange(undefined)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Effacer
          </button>
        </div>
      </div>
    </div>
  );
}
