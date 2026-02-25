import * as React from 'react';
import { Badge } from './badge';
import { Input } from './input';
import { cn } from '../../lib/utils';
import { X, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Sélectionner...',
  searchable = true,
  className,
}: MultiSelectComboboxProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [dropUp, setDropUp] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine if dropdown should open upward when space below is limited
  React.useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 280; // max-h-60 (240px) + search bar (~40px)
      setDropUp(spaceBelow < dropdownHeight);
    }
  }, [open]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  function toggle(value: string): void {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function removeItem(value: string, e: React.MouseEvent): void {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  }

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as MultiSelectOption[];

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full min-h-[40px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'hover:bg-accent/50 transition-colors'
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedLabels.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {selectedLabels.map((item) => (
            <Badge key={item.value} variant="secondary" className="text-xs py-0 px-1.5 gap-1">
              {item.label}
              <X
                className="h-3 w-3 cursor-pointer hover:text-destructive"
                onClick={(e) => removeItem(item.value, e)}
              />
            </Badge>
          ))}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          'absolute z-50 w-full rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95',
          dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
        )}>
          {searchable && (
            <div className="p-2 border-b">
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Aucun résultat
              </div>
            )}
            {filteredOptions.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer',
                    'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent/50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
