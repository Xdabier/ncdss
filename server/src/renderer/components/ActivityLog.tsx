import React, { useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

interface Props {
  logs: string[];
}

export function ActivityLog({ logs }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="pb-3 px-4">
        <CardTitle className="text-sm font-semibold text-gray-600">
          📋 Activité récente
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div
          ref={logRef}
          className="h-32 overflow-y-auto bg-gray-900 text-green-400 text-xs font-mono p-3 rounded-md"
        >
          {logs.length === 0 ? (
            <p className="text-gray-500">Aucune activité</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="py-0.5">
                {log}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
