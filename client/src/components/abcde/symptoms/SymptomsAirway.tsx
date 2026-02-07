import React from 'react';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

interface Props {
  value?: string;
  onChange: (value: string) => void;
}

const OPTIONS = [
  { value: 'libre', label: 'Libre' },
  { value: 'a_risque', label: 'A risque' },
  { value: 'obstrue', label: 'Obstrué' },
] as const;

export function SymptomsAirway({ value, onChange }: Props): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label className="text-base font-semibold">Voies aériennes</Label>
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Sélectionner le statut..." />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
