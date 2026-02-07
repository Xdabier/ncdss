import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface TriageAccordionContextType {
  openSections: Set<string>;
  pinnedSections: Set<string>;
  handleClick: (id: string) => void;
}

const TriageAccordionContext = createContext<TriageAccordionContextType>({
  openSections: new Set(),
  pinnedSections: new Set(),
  handleClick: () => {},
});

export function useTriageAccordion(): TriageAccordionContextType {
  return useContext(TriageAccordionContext);
}

interface TriageAccordionProps {
  children: React.ReactNode;
  onSectionCollapse?: (sectionId: string) => void;
  defaultOpen?: string;
}

export function TriageAccordion({ children, onSectionCollapse, defaultOpen }: TriageAccordionProps): React.ReactElement {
  const [openSections, setOpenSections] = useState<Set<string>>(
    defaultOpen ? new Set([defaultOpen]) : new Set()
  );
  const [pinnedSections, setPinnedSections] = useState<Set<string>>(new Set());
  const clickTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleClick = useCallback((id: string) => {
    // If there's already a pending single-click timer for this id, it's a double-click
    if (clickTimerRef.current[id]) {
      clearTimeout(clickTimerRef.current[id]);
      delete clickTimerRef.current[id];

      // Double-click: toggle pin
      setPinnedSections(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      // Ensure section is open when pinning
      setOpenSections(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      return;
    }

    // Start a single-click timer
    clickTimerRef.current[id] = setTimeout(() => {
      delete clickTimerRef.current[id];

      setOpenSections(prev => {
        const next = new Set<string>();
        const wasOpen = prev.has(id);

        // Keep all pinned sections open
        pinnedSections.forEach(pid => next.add(pid));

        if (wasOpen && !pinnedSections.has(id)) {
          // Close this section
          // Notify collapse
          onSectionCollapse?.(id);
        } else {
          // Open this section
          next.add(id);
        }

        // Notify collapsed sections (non-pinned that were open and aren't anymore)
        prev.forEach(prevId => {
          if (prevId !== id && !pinnedSections.has(prevId) && !next.has(prevId)) {
            onSectionCollapse?.(prevId);
          }
        });

        return next;
      });
    }, 250);
  }, [pinnedSections, onSectionCollapse]);

  return (
    <TriageAccordionContext.Provider value={{ openSections, pinnedSections, handleClick }}>
      <div className="space-y-2">
        {children}
      </div>
    </TriageAccordionContext.Provider>
  );
}
