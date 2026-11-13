import * as React from 'react';
import { Input } from './input';
import { cn } from '../../lib/utils';
import { ChevronDown, Check } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Sélectionner...',
  disabled = false,
  className,
}: ComboboxProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [highlightIndex, setHighlightIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        setHighlightIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  React.useEffect(() => {
    setHighlightIndex(-1);
  }, [search]);

  function handleSelect(val: string): void {
    onChange(val);
    setOpen(false);
    setSearch('');
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
      setHighlightIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightIndex].value);
      }
    }
  }

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-combobox-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={containerRef} role="presentation" className={cn('relative', className)} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open); }}
        disabled={disabled}
        className={cn(
          'flex w-full min-h-[40px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'hover:bg-accent/50 transition-colors',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn(!selectedLabel && 'text-muted-foreground')}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="p-2 border-b">
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- search field of a dropdown the user just opened
              autoFocus
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Aucun résultat
              </div>
            )}
            {filteredOptions.map((option, idx) => {
              const isSelected = option.value === value;
              const isHighlighted = idx === highlightIndex;
              return (
                <div
                  key={option.value}
                  data-combobox-item
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(option.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      // Keep the container handler from also selecting the highlighted item
                      e.stopPropagation();
                      handleSelect(option.value);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer',
                    'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent/50',
                    isHighlighted && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span>{option.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
