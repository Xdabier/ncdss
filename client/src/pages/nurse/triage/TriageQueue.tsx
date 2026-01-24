import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../../services/api';
import { Patient, PatientStatus } from '@ncdss/shared';
import { formatDateTime } from '../../../utils/dateUtils';

export default function TriageQueue() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatients();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadPatients, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPatients = async () => {
    try {
      const api = await getApi();
      const response = await api.get('/patients', {
        params: { status: PatientStatus.REGISTERED }
      });
      setPatients(response.data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTriage = async (patientId: string) => {
    try {
      const api = await getApi();
      await api.post(`/patients/${patientId}/start-triage`);

      // Redirect to ABCDE assessment
      navigate(`/nurse/triage/${patientId}/abcde`);
    } catch (error) {
      console.error('Error starting triage:', error);
      alert('Erreur lors du démarrage du triage');
    }
  };

  const columns: Column<Patient>[] = [
    {
      key: 'fullName',
      header: 'Patient',
      width: '30%',
      render: (p) => (
        <div>
          <div className="font-medium">{p.fullName}</div>
          <div className="text-sm text-gray-500">{p.age} ans, {p.sex === 'MALE' ? 'H' : 'F'}</div>
        </div>
      )
    },
    {
      key: 'chiefComplaint',
      header: 'Motif',
      width: '35%',
      render: (p) => p.chiefComplaint || <span className="text-gray-400">—</span>
    },
    {
      key: 'createdAt',
      header: "Heure d'arrivée",
      width: '20%',
      render: (p) => formatDateTime(p.createdAt).split(' ')[1]
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '15%',
      render: (p) => (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleStartTriage(p.id);
          }}
        >
          Commencer triage
        </Button>
      )
    }
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">File de Triage</h1>
          <Badge variant={patients.length > 0 ? 'destructive' : 'outline'} className="text-lg px-4 py-2">
            {patients.length} patient{patients.length !== 1 ? 's' : ''} en attente
          </Badge>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={patients}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage="Aucun patient en attente de triage"
          />
        </div>

        {/* Info banner */}
        {patients.length === 0 && !loading && (
          <Card className="mt-4 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Aucun patient en attente</p>
                  <p>La liste se rafraîchit automatiquement toutes les 30 secondes.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
