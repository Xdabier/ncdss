import React from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/card';

interface Props {
  ip: string;
}

export function ConnectionInfo({ ip }: Props) {
  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Adresse IP:</span>
          <code className="bg-white px-3 py-1.5 rounded-md border font-mono text-base font-bold text-blue-600">
            {ip}
          </code>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-gray-600">
          <p className="font-semibold mb-2">📋 Pour connecter un client:</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-500">
            <li>Ouvrir NCDSS Client sur le poste</li>
            <li>
              Entrer l'adresse: <code className="bg-gray-100 px-1 rounded">{ip}</code>
            </li>
            <li>Se connecter avec identifiants</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
