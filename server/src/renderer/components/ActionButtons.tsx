import React from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

interface Props {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onBackup: () => void;
  onOpenLogs: () => void;
  onOpenData: () => void;
  onClearPatients: () => void;
}

export function ActionButtons({
  running,
  onStart,
  onStop,
  onBackup,
  onOpenLogs,
  onOpenData,
  onClearPatients,
}: Props) {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2">
          {running ? (
            <Button variant="destructive" onClick={onStop} className="gap-2">
              ⏹ Arrêter
            </Button>
          ) : (
            <Button
              variant="default"
              onClick={onStart}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              ▶ Démarrer
            </Button>
          )}

          <Button variant="default" onClick={onBackup} className="gap-2">
            ☁ Sauvegarder
          </Button>

          <Button variant="secondary" onClick={onOpenLogs} className="gap-2">
            📄 Logs
          </Button>

          <Button variant="secondary" onClick={onOpenData} className="gap-2">
            📁 Dossier
          </Button>

          <Button
            variant="destructive"
            onClick={onClearPatients}
            className="col-span-2 gap-2"
          >
            🗑 Purger les patients
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
