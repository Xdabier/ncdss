import React, { useState } from 'react';
import { Pin, ChevronUp, ChevronDown } from 'lucide-react';
import { useTriageAccordion } from './TriageAccordion';
import type { LucideIcon } from 'lucide-react';

interface TriageAccordionSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  statusSummary?: React.ReactNode;
  children: React.ReactNode;
  sectionRef?: React.RefObject<HTMLDivElement>;
}

export function TriageAccordionSection({
  id,
  title,
  icon: Icon,
  statusSummary,
  children,
  sectionRef,
}: TriageAccordionSectionProps): React.ReactElement {
  const { openSections, pinnedSections, handleClick } = useTriageAccordion();
  const isOpen = openSections.has(id);
  const isPinned = pinnedSections.has(id);

  // After expand animation completes, allow overflow so dropdowns aren't clipped
  const [expanded, setExpanded] = useState(isOpen);
  if (!isOpen && expanded) {
    setExpanded(false);
  }

  const handleTransitionEnd = (): void => {
    if (isOpen) setExpanded(true);
  };

  return (
    <div ref={sectionRef} className={`border rounded-lg bg-white shadow-sm ${expanded ? '' : 'overflow-hidden'}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => handleClick(id)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors select-none"
      >
        <Icon className="h-5 w-5 text-blue-600 shrink-0" />
        <span className="font-medium text-gray-900 flex-1">{title}</span>
        {statusSummary && (
          <span className="text-sm shrink-0">{statusSummary}</span>
        )}
        {isPinned && (
          <Pin className="h-4 w-4 text-blue-500 shrink-0" />
        )}
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Content with CSS grid transition */}
      <div
        className="transition-[grid-template-rows] duration-300 ease-in-out"
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className={expanded ? '' : 'overflow-hidden'}>
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
