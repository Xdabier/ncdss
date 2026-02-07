import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TabSection {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface TriageTabNavProps {
  sections: TabSection[];
  activeId: string | null;
  onTabClick: (id: string) => void;
}

export function TriageTabNav({ sections, activeId, onTabClick }: TriageTabNavProps): React.ReactElement {
  return (
    <div className="bg-white border-b flex overflow-x-auto px-4 gap-1">
      {sections.map(({ id, label, icon: Icon }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabClick(id)}
            className={cn(
              'flex items-center gap-1.5 text-sm py-2 px-3 whitespace-nowrap shrink-0 transition-colors border-b-2',
              isActive
                ? 'text-blue-600 border-blue-600 bg-blue-50'
                : 'text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
