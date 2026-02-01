import React from 'react';

interface ReadOnlyVitalBadgeProps {
  label: string;
  value: number | undefined | null;
  unit: string;
  getColor?: (value: number) => string;
}

export function ReadOnlyVitalBadge({ label, value, unit, getColor }: ReadOnlyVitalBadgeProps): React.ReactElement | null {
  if (value == null) return null;

  const colorClass = getColor ? getColor(value) : 'bg-gray-100 text-gray-700 border-gray-300';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${colorClass}`}>
      <span className="text-xs font-medium opacity-75">{label}</span>
      <span className="font-bold">{value}</span>
      <span className="text-xs opacity-75">{unit}</span>
    </div>
  );
}
