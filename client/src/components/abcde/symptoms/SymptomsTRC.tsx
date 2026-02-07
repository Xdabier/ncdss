import React from 'react';
import { Label } from '../../ui/label';
import { cn } from '../../../lib/utils';

interface Props {
  value?: number;
  onChange: (value: number | undefined) => void;
}

function getTRCColor(value: number): string {
  if (value <= 2) return 'text-green-700 bg-green-50 border-green-300';
  if (value <= 3) return 'text-yellow-700 bg-yellow-50 border-yellow-300';
  return 'text-red-700 bg-red-50 border-red-300';
}

export function SymptomsTRC({ value, onChange }: Props): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">TRC (temps de recoloration cutané)</Label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={0.5}
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : parseFloat(v));
          }}
          placeholder="Secondes"
          className={cn(
            'flex h-10 w-32 rounded-md border px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value != null ? getTRCColor(value) : 'border-input bg-background'
          )}
        />
        <span className="text-sm text-muted-foreground">secondes</span>
        {value != null && (
          <span className={cn(
            'text-xs font-medium px-2 py-1 rounded-full border',
            getTRCColor(value)
          )}>
            {value <= 2 ? 'Normal' : value <= 3 ? 'Allongé' : 'Critique'}
          </span>
        )}
      </div>
    </div>
  );
}
