import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

interface Props {
  status: {
    running: boolean;
    connectedClients: number;
    llmStatus: string;
    llmProvider?: 'local' | 'claude';
  };
}

export function StatusPanel({ status }: Props) {
  const providerLabel = status.llmProvider === 'claude' ? 'Claude' : 'Local';

  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">État du serveur:</span>
          {status.running ? (
            <Badge variant="success" className="gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              EN MARCHE
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <span className="w-2 h-2 bg-white rounded-full"></span>
              ARRÊTÉ
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Clients connectés:</span>
          <Badge variant="outline">{status.connectedClients}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">LLM:</span>
          <Badge
            variant={
              status.llmStatus === 'ready'
                ? 'success'
                : status.llmStatus === 'loading'
                  ? 'warning'
                  : 'outline'
            }
          >
            {status.llmStatus === 'ready'
              ? `Pret (${providerLabel})`
              : status.llmStatus === 'loading'
                ? 'Chargement...'
                : status.llmStatus === 'error'
                  ? 'Erreur'
                  : `Non charge (${providerLabel})`}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
