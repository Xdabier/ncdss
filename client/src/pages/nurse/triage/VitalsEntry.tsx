import React from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Construction } from 'lucide-react';

export default function VitalsEntry() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Construction className="h-6 w-6 text-orange-500" />
                Saisie des Constantes
              </CardTitle>
              <CardDescription>Cette page sera implémentée dans une future version</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Fonctionnalités à venir :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Tension artérielle</li>
                <li>Fréquence cardiaque et respiratoire</li>
                <li>Température et saturation O2</li>
                <li>Glycémie et douleur (EVA)</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
