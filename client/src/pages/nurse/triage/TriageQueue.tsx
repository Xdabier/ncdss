import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, PatientStatus, API_ROUTES } from '@ncdss/shared';
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
      // Fetch both waiting patients and those currently being triaged
      const response = await api.get(API_ROUTES.patients.list, {
        params: { status: [PatientStatus.REGISTERED, PatientStatus.IN_TRIAGE] }
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
      await api.post(API_ROUTES.patients.startTriage(patientId));

      // Redirect to ABCDE assessment
      navigate(CLIENT_ROUTES.nurse.triage.abcde(patientId));
    } catch (error) {
      console.error('Error starting triage:', error);
      alert('Erreur lors du démarrage du triage');
    }
  };

  const handleResumeTriage = (patientId: string) => {
    // Navigate directly to ABCDE assessment without calling start-triage again
    navigate(CLIENT_ROUTES.nurse.triage.abcde(patientId));
  };

  const columns: Column<Patient>[] = [
    {
      key: 'fullName',
      header: 'Patient',
      width: '25%',
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
      width: '30%',
      render: (p) => p.chiefComplaint || <span className="text-gray-400">—</span>
    },
    {
      key: 'status',
      header: 'Statut',
      width: '15%',
      render: (p) => (
        p.status === PatientStatus.IN_TRIAGE ? (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            En cours
          </Badge>
        ) : (
          <Badge variant="outline">En attente</Badge>
        )
      )
    },
    {
      key: 'createdAt',
      header: "Heure d'arrivée",
      width: '15%',
      render: (p) => formatDateTime(p.createdAt).split(' ')[1]
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '15%',
      render: (p) => (
        p.status === PatientStatus.IN_TRIAGE ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              handleResumeTriage(p.id);
            }}
          >
            Reprendre
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleStartTriage(p.id);
            }}
          >
            Commencer
          </Button>
        )
      )
    }
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">File de Triage</h1>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {patients.filter(p => p.status === PatientStatus.REGISTERED).length} en attente
            </Badge>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1">
              {patients.filter(p => p.status === PatientStatus.IN_TRIAGE).length} en cours
            </Badge>
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={patients}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage="Aucun patient à trier"
          />
        </div>

        {/* Info banner */}
        {patients.length === 0 && !loading && (
          <Card className="mt-4 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Aucun patient à trier</p>
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
