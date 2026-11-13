import React, { useLayoutEffect, useRef } from 'react';
import type { SymptomsFormData } from '@ncdss/shared';
import { Label } from '../ui/label';
import {
  SymptomsAirway,
  SymptomsAuscultation,
  SymptomsWork,
  SymptomsSkin,
  SymptomsTRC,
  SymptomsBleeding,
  SymptomsPain,
  SymptomsPupils,
  SymptomsTrauma,
} from './symptoms';

interface Props {
  data: Partial<SymptomsFormData>;
  onChange: (data: Partial<SymptomsFormData>) => void;
}

export function SymptomsForm({ data, onChange }: Props): React.ReactElement {
  // Ref tracks the latest data so that sequential update() calls within
  // the same tick each see the result of the previous call, preventing
  // stale-closure overwrites. Synced after every render, before any handler runs.
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  });

  const update = <K extends keyof SymptomsFormData>(field: K, value: SymptomsFormData[K]): void => {
    const updated = { ...dataRef.current, [field]: value };
    dataRef.current = updated;
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {/* 1. Airway */}
      <SymptomsAirway
        value={data.airwayStatus}
        onChange={(v) => update('airwayStatus', v as SymptomsFormData['airwayStatus'])}
      />

      <hr className="border-border" />

      {/* 2. Auscultation */}
      <SymptomsAuscultation
        normal={data.auscultationNormal}
        details={data.breathSoundsDetail}
        onNormalChange={(v) => update('auscultationNormal', v)}
        onDetailsChange={(v) => update('breathSoundsDetail', v)}
      />

      <hr className="border-border" />

      {/* 3. Work of breathing */}
      <SymptomsWork
        signesLutte={data.signesLutte}
        pauseRespiratoire={data.pauseRespiratoire}
        onSignesLutteChange={(v) => update('signesLutte', v)}
        onPauseChange={(v) => update('pauseRespiratoire', v)}
      />

      <hr className="border-border" />

      {/* 4. Skin signs */}
      <SymptomsSkin
        selected={data.signesCutanes}
        onChange={(v) => update('signesCutanes', v)}
      />

      <hr className="border-border" />

      {/* 5. Capillary refill */}
      <SymptomsTRC
        value={data.capillaryRefill}
        onChange={(v) => update('capillaryRefill', v as number | undefined)}
      />

      <hr className="border-border" />

      {/* 6. Bleeding */}
      <SymptomsBleeding
        interne={data.bleedingInterne}
        exteriorisee={data.bleedingExteriorisee}
        types={data.bleedingTypes}
        onInterneChange={(v) => update('bleedingInterne', v)}
        onExterioriseeChange={(v) => update('bleedingExteriorisee', v)}
        onTypesChange={(v) => update('bleedingTypes', v)}
      />

      <hr className="border-border" />

      {/* 7. Pain */}
      <SymptomsPain
        selected={data.painLocations}
        onChange={(v) => update('painLocations', v)}
      />

      <hr className="border-border" />

      {/* 8. Pupils */}
      <SymptomsPupils
        size={data.pupilSize}
        symmetry={data.pupilSymmetry}
        reactivity={data.pupilReactivity}
        onSizeChange={(v) => update('pupilSize', v as SymptomsFormData['pupilSize'])}
        onSymmetryChange={(v) => update('pupilSymmetry', v as SymptomsFormData['pupilSymmetry'])}
        onReactivityChange={(v) => update('pupilReactivity', v as SymptomsFormData['pupilReactivity'])}
      />

      <hr className="border-border" />

      {/* 9. Trauma */}
      <SymptomsTrauma
        selected={data.traumaTypes}
        onChange={(v) => update('traumaTypes', v)}
      />

      <hr className="border-border" />

      {/* 10. Notes */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Notes</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={data.notes ?? ''}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Notes additionnelles..."
        />
      </div>
    </div>
  );
}
