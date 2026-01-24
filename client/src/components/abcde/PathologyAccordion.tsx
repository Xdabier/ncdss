import React, { useState, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { InterventionGroup, SelectedIntervention, InterventionType } from './InterventionGroup';

interface Intervention {
  id: number;
  pathologyName: string;
  category: string;
  severitySigns: string[] | null;
  nursingInterventions: string[] | null;
  medicalInterventions: string[] | null;
}

interface PathologyAccordionProps {
  pathologyName: string;
  interventions: Intervention[];
  selectedInterventions: SelectedIntervention[];
  onSelectionChange: (intervention: SelectedIntervention) => void;
  defaultOpen?: boolean;
}

export function PathologyAccordion({
  pathologyName,
  interventions,
  selectedInterventions,
  onSelectionChange,
  defaultOpen = false,
}: PathologyAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Aggregate all items from interventions for this pathology
  const aggregatedItems = useMemo(() => {
    const severitySigns: string[] = [];
    const nursingInterventions: string[] = [];
    const medicalInterventions: string[] = [];

    interventions.forEach((intervention) => {
      if (intervention.severitySigns) {
        intervention.severitySigns.forEach((sign) => {
          if (!severitySigns.includes(sign)) {
            severitySigns.push(sign);
          }
        });
      }
      if (intervention.nursingInterventions) {
        intervention.nursingInterventions.forEach((item) => {
          if (!nursingInterventions.includes(item)) {
            nursingInterventions.push(item);
          }
        });
      }
      if (intervention.medicalInterventions) {
        intervention.medicalInterventions.forEach((item) => {
          if (!medicalInterventions.includes(item)) {
            medicalInterventions.push(item);
          }
        });
      }
    });

    return { severitySigns, nursingInterventions, medicalInterventions };
  }, [interventions]);

  // Count total items and selected items
  const totalItems =
    aggregatedItems.severitySigns.length +
    aggregatedItems.nursingInterventions.length +
    aggregatedItems.medicalInterventions.length;

  const selectedCount = selectedInterventions.filter(
    (s) => s.pathologyName === pathologyName
  ).length;

  const hasSelections = selectedCount > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
          hasSelections ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="font-medium text-sm">{pathologyName}</span>
          {hasSelections && (
            <svg
              className="h-4 w-4 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <Badge variant={hasSelections ? 'info' : 'secondary'}>
          {selectedCount}/{totalItems}
        </Badge>
      </button>

      {isOpen && (
        <div className="p-4 space-y-4 bg-white border-t">
          <InterventionGroup
            title="Signes de gravité"
            type="severity"
            items={aggregatedItems.severitySigns}
            pathologyName={pathologyName}
            selectedItems={selectedInterventions}
            onToggle={onSelectionChange}
          />

          <InterventionGroup
            title="Interventions infirmières"
            type="nursing"
            items={aggregatedItems.nursingInterventions}
            pathologyName={pathologyName}
            selectedItems={selectedInterventions}
            onToggle={onSelectionChange}
          />

          <InterventionGroup
            title="Interventions médicales"
            type="medical"
            items={aggregatedItems.medicalInterventions}
            pathologyName={pathologyName}
            selectedItems={selectedInterventions}
            onToggle={onSelectionChange}
          />
        </div>
      )}
    </div>
  );
}
