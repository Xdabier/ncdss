import React from 'react';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

export type InterventionType = 'severity' | 'nursing' | 'medical';

export interface SelectedIntervention {
  pathologyName: string;
  type: InterventionType;
  item: string;
}

interface InterventionGroupProps {
  title: string;
  type: InterventionType;
  items: string[];
  pathologyName: string;
  selectedItems: SelectedIntervention[];
  onToggle: (intervention: SelectedIntervention) => void;
}

const typeConfig: Record<InterventionType, { colorClass: string; bgClass: string }> = {
  severity: { colorClass: 'text-red-600', bgClass: 'border-red-200 hover:bg-red-50' },
  nursing: { colorClass: 'text-blue-600', bgClass: 'border-blue-200 hover:bg-blue-50' },
  medical: { colorClass: 'text-green-600', bgClass: 'border-green-200 hover:bg-green-50' },
};

export function InterventionGroup({
  title,
  type,
  items,
  pathologyName,
  selectedItems,
  onToggle,
}: InterventionGroupProps) {
  if (!items || items.length === 0) {
    return null;
  }

  const { colorClass, bgClass } = typeConfig[type];

  const isSelected = (item: string) =>
    selectedItems.some(
      (s) => s.pathologyName === pathologyName && s.type === type && s.item === item
    );

  const handleToggle = (item: string) => {
    onToggle({ pathologyName, type, item });
  };

  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${colorClass}`}>
        {title}
      </h4>
      <div className="space-y-1">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className={`flex items-start space-x-2 p-2 border rounded-md cursor-pointer transition-colors ${bgClass}`}
            onClick={() => handleToggle(item)}
          >
            <Checkbox
              id={`${pathologyName}-${type}-${index}`}
              checked={isSelected(item)}
              onCheckedChange={() => handleToggle(item)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5"
            />
            <Label
              htmlFor={`${pathologyName}-${type}-${index}`}
              className="text-sm leading-tight cursor-pointer flex-1"
            >
              {item}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
