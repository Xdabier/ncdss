import { randomUUID } from 'crypto';
import { BoxType } from '@ncdss/shared';

export interface BoxLayout {
  triageBoxes: number;
  medicalBoxes: number;
  surgicalBoxes: number;
  traumaBoxes: number;
  sauvBeds: number;
  dechocageBeds: number;
}

export interface BoxRow {
  id: string;
  name: string;
  boxType: string;
  isActive: boolean;
}

const BOX_GROUPS: { count: keyof BoxLayout; label: string; type: BoxType }[] = [
  { count: 'triageBoxes', label: 'Box Triage', type: BoxType.TRIAGE },
  { count: 'medicalBoxes', label: 'Box Médical', type: BoxType.MEDICAL },
  { count: 'surgicalBoxes', label: 'Box Chirurgical', type: BoxType.SURGICAL },
  { count: 'traumaBoxes', label: 'Box Traumato', type: BoxType.TRAUMA },
  { count: 'sauvBeds', label: 'Box SAUV', type: BoxType.SAUV },
  { count: 'dechocageBeds', label: 'Box Déchocage', type: BoxType.DECHOCAGE },
];

/** Builds one active box row per unit of the ER layout. */
export function buildBoxesForLayout(layout: BoxLayout): BoxRow[] {
  return BOX_GROUPS.flatMap(({ count, label, type }) =>
    Array.from({ length: layout[count] }, (_, index) => ({
      id: randomUUID(),
      name: `${label} ${index + 1}`,
      boxType: type,
      isActive: true,
    }))
  );
}
