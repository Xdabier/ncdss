import React, { ReactNode } from 'react';
import { Loader2, LucideIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  hiddenOnMobile?: boolean;
  render?: (item: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  onRowClick?: (item: T) => void;
  keyExtractor: (item: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = 'Aucune donnée',
  emptyIcon,
  onRowClick,
  keyExtractor,
}: Props<T>) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} icon={emptyIcon} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-100 border-b">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`px-2 sm:px-4 py-2 sm:py-3 text-left text-sm font-semibold text-gray-600${col.hiddenOnMobile ? ' hidden sm:table-cell' : ''}`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={`border-b hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={`px-2 sm:px-4 py-2 sm:py-3 text-sm${col.hiddenOnMobile ? ' hidden sm:table-cell' : ''}`}
                >
                  {col.render ? col.render(item) : String((item as Record<PropertyKey, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
