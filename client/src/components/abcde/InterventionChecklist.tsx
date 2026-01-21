import React from 'react';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';

interface InterventionChecklistProps {
  title: string;
  items: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  colorClass?: string;
}

export const InterventionChecklist: React.FC<InterventionChecklistProps> = ({
  title,
  items,
  selected,
  onChange,
  colorClass = 'text-blue-600'
}) => {
  const handleToggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter(i => i !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className={`text-sm font-semibold ${colorClass}`}>{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex items-start space-x-2 p-3 border rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => handleToggle(item)}
          >
            <Checkbox
              id={`${title}-${index}`}
              checked={selected.includes(item)}
              onCheckedChange={() => handleToggle(item)}
              onClick={(e) => e.stopPropagation()}
            />
            <Label
              htmlFor={`${title}-${index}`}
              className="text-sm leading-tight cursor-pointer flex-1"
            >
              {item}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
};
