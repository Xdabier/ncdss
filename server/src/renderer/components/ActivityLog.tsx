import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import type { LogEntry } from '../electron.d';

type LevelFilter = 'all' | 'error' | 'warn' | 'info';

interface Props {
  logs: LogEntry[];
  onCopy: () => Promise<void>;
  onClear: () => void;
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-green-400',
};

const LEVEL_TAG_COLORS: Record<LogEntry['level'], string> = {
  error: 'text-red-500 font-bold',
  warn: 'text-yellow-500 font-bold',
  info: 'text-gray-500',
};

export function ActivityLog({ logs, onCopy, onClear }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const log of logs) {
      if (log.level === 'error') errors++;
      else if (log.level === 'warn') warnings++;
    }
    return { errors, warnings };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter((l) => l.level === filter);
  }, [logs, filter]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatTime = (iso: string): string => {
    return iso.slice(11, 19); // HH:MM:SS
  };

  const filterButtons: { key: LevelFilter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'error', label: 'Erreurs' },
    { key: 'warn', label: 'Alertes' },
    { key: 'info', label: 'Info' },
  ];

  return (
    <Card className="border-none shadow-none flex flex-col flex-1">
      <CardHeader className="pb-2 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            Journal d'activite
            {counts.errors > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {counts.errors}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {counts.warnings}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
            >
              {copied ? 'Copie !' : 'Copier'}
            </button>
            <button
              onClick={onClear}
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
            >
              Effacer
            </button>
          </div>
        </div>
        {/* Filter buttons */}
        <div className="flex gap-1 mt-2">
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setFilter(fb.key)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                filter === fb.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex-1 flex flex-col min-h-0">
        <div
          ref={logRef}
          className="min-h-[200px] max-h-[400px] flex-1 overflow-y-auto bg-gray-900 text-xs font-mono p-3 rounded-md"
        >
          {filteredLogs.length === 0 ? (
            <p className="text-gray-500">Aucune activite</p>
          ) : (
            filteredLogs.map((entry, i) => (
              <div key={i} className={`py-0.5 ${LEVEL_COLORS[entry.level]}`}>
                <span className="text-gray-500">{formatTime(entry.timestamp)}</span>{' '}
                <span className={LEVEL_TAG_COLORS[entry.level]}>
                  [{entry.level.toUpperCase()}]
                </span>{' '}
                {entry.message}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
