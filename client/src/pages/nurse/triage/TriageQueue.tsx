import React, { useState, useEffect, useMemo } from 'react';
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

type AbsentCallEntry = { timestamp: string; calledBy: string; type?: 'call' | 'recall' };

function parseAbsentHistory(patient: Patient): AbsentCallEntry[] {
  if (!patient.absentCallHistory) return [];
  try {
    const parsed = JSON.parse(patient.absentCallHistory);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isPatientAbsent(patient: Patient): boolean {
  if (patient.status !== PatientStatus.REGISTERED) return false;
  const history = parseAbsentHistory(patient);
  if (history.length === 0) return false;
  const last = history[history.length - 1];
  return last.type === 'call';
}

function getAbsentCallCount(patient: Patient): number {
  const history = parseAbsentHistory(patient);
  return history.filter(e => e.type === 'call').length;
}

function getLastAbsentTimestamp(patient: Patient): string | null {
  const history = parseAbsentHistory(patient);
  const calls = history.filter(e => e.type === 'call');
  if (calls.length === 0) return null;
  return calls[calls.length - 1].timestamp;
}

export default function TriageQueue() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'actifs' | 'absents'>('actifs');

  useEffect(() => {
    loadPatients();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadPatients, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPatients = async (): Promise<void> => {
    try {
      const api = await getApi();
      // Fetch both waiting patients and those currently being triaged
      const response = await api.get(API_ROUTES.patients.list, {
        params: { status: [PatientStatus.REGISTERED, PatientStatus.IN_TRIAGE, PatientStatus.TRIAGED] }
      });
      setPatients(response.data as Patient[]);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const { activePatients, absentPatients } = useMemo(() => {
    const active: Patient[] = [];
    const absent: Patient[] = [];

    for (const p of patients) {
      if (isPatientAbsent(p)) {
        absent.push(p);
      } else {
        active.push(p);
      }
    }

    // Sort active: re-triage requested first, then IN_TRIAGE, REGISTERED, TRIAGED
    active.sort((a, b) => {
      const priority = (p: Patient): number => {
        if (p.retriageRequested) return 0;
        if (p.status === PatientStatus.IN_TRIAGE) return 1;
        if (p.status === PatientStatus.REGISTERED) return 2;
        return 3; // TRIAGED
      };
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Sort absent: most recent absent call first
    absent.sort((a, b) => {
      const tsA = getLastAbsentTimestamp(a);
      const tsB = getLastAbsentTimestamp(b);
      if (!tsA && !tsB) return 0;
      if (!tsA) return 1;
      if (!tsB) return -1;
      return new Date(tsB).getTime() - new Date(tsA).getTime();
    });

    return { activePatients: active, absentPatients: absent };
  }, [patients]);

  const handleStartTriage = async (patientId: string): Promise<void> => {
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

  const handleResumeTriage = (patientId: string): void => {
    // Navigate directly to ABCDE assessment without calling start-triage again
    navigate(CLIENT_ROUTES.nurse.triage.abcde(patientId));
  };

  const handleAbsentCall = async (patientId: string): Promise<void> => {
    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.absentCall(patientId));
      await loadPatients();
    } catch (error) {
      console.error('Error marking patient as absent:', error);
      alert('Erreur lors du marquage absent');
    }
  };

  const handleRecall = async (patientId: string): Promise<void> => {
    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.recallPatient(patientId));
      await loadPatients();
    } catch (error) {
      console.error('Error recalling patient:', error);
      alert('Erreur lors du rappel du patient');
    }
  };

  const columns: Column<Patient>[] = [
    {
      key: 'fullName',
      header: 'Patient',
      width: '25%',
      render: (p) => {
        const absentCount = getAbsentCallCount(p);
        return (
          <div>
            <div className="font-medium">{p.fullName}</div>
            <div className="text-sm text-gray-500">{p.age} ans, {p.sex === 'MALE' ? 'H' : 'F'}</div>
            {p.retriageReason && (
              <div className="text-xs text-orange-600 mt-0.5">Raison : {p.retriageReason}</div>
            )}
            {absentCount > 0 && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs mt-0.5">
                Absent ×{absentCount}
              </Badge>
            )}
          </div>
        );
      }
    },
    {
      key: 'chiefComplaint',
      header: 'Motif',
      width: '30%',
      render: (p) => p.chiefComplaint || <span className="text-gray-400">-</span>
    },
    {
      key: 'status',
      header: 'Statut',
      width: '15%',
      render: (p) => (
        <div className="flex flex-col gap-1">
          {p.status === PatientStatus.IN_TRIAGE ? (
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              En cours
            </Badge>
          ) : p.status === PatientStatus.TRIAGED ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Trié
            </Badge>
          ) : (
            <Badge variant="outline">En attente</Badge>
          )}
          {p.retriageRequested && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
              Re-triage demandé
            </Badge>
          )}
        </div>
      )
    },
    {
      key: 'createdAt',
      header: "Heure d'arrivée",
      width: '15%',
      hiddenOnMobile: true,
      render: (p) => formatDateTime(p.createdAt).split(' ')[1]
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '15%',
      render: (p) => {
        if (p.status === PatientStatus.IN_TRIAGE) {
          return (
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
          );
        }
        if (p.status === PatientStatus.TRIAGED) {
          return (
            <Button
              size="sm"
              className={p.retriageRequested ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
              onClick={(e) => {
                e.stopPropagation();
                handleStartTriage(p.id);
              }}
            >
              {p.retriageRequested ? 'Re-trier (urgent)' : 'Re-trier'}
            </Button>
          );
        }

        // REGISTERED patients
        if (activeTab === 'absents') {
          const absentCount = getAbsentCallCount(p);
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRecall(p.id);
                }}
              >
                Rappeler
              </Button>
              {absentCount > 0 && (
                <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs">
                  ×{absentCount}
                </Badge>
              )}
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className={p.retriageRequested ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}
              onClick={(e) => {
                e.stopPropagation();
                handleStartTriage(p.id);
              }}
            >
              {p.retriageRequested ? 'Re-trier (urgent)' : 'Commencer'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
              onClick={(e) => {
                e.stopPropagation();
                handleAbsentCall(p.id);
              }}
            >
              Absent
            </Button>
          </div>
        );
      }
    }
  ];

  const displayedPatients = activeTab === 'actifs' ? activePatients : absentPatients;

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold">File de Triage</h1>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {patients.filter(p => p.status === PatientStatus.REGISTERED).length} en attente
            </Badge>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1">
              {patients.filter(p => p.status === PatientStatus.IN_TRIAGE).length} en cours
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800 text-sm px-3 py-1">
              {patients.filter(p => p.status === PatientStatus.TRIAGED).length} triés
            </Badge>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'actifs'
                ? 'text-purple-700 border-b-2 border-purple-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('actifs')}
          >
            Actifs ({activePatients.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'absents'
                ? 'text-orange-700 border-b-2 border-orange-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('absents')}
          >
            Absents ({absentPatients.length})
          </button>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={displayedPatients}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage={activeTab === 'actifs' ? 'Aucun patient à trier' : 'Aucun patient absent'}
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
