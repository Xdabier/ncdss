import React from 'react';
import { FolderOpen, LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  message: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  message,
  icon: Icon = FolderOpen,
  action,
  className
}: Props) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 text-muted-foreground",
      className
    )}>
      <Icon className="h-16 w-16 mb-4 stroke-1" />
      <p className="text-lg text-center">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
