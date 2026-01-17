import React from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Construction } from 'lucide-react';

export default function AllPatients() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Construction className="h-6 w-6 text-orange-500" />
                Tous les Patients
              </CardTitle>
              <CardDescription>Cette page sera implémentée dans une future version</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Fonctionnalités à venir :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Liste complète des patients présents</li>
                <li>Filtrage par statut et ESI</li>
                <li>Recherche par nom/dossier</li>
                <li>Vue détaillée de chaque patient</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
