import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, onKeyDown, ...props }, ref) => {
    const handleWheel = React.useCallback(
      (e: React.WheelEvent<HTMLInputElement>) => {
        if (type === 'number') {
          (e.target as HTMLInputElement).blur();
          e.preventDefault();
          return;
        }
        onWheel?.(e);
      },
      [type, onWheel]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          return;
        }
        onKeyDown?.(e);
      },
      [type, onKeyDown]
    );

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
