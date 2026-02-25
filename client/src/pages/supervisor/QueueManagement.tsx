import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Users,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ClipboardList,
  Stethoscope,
  Activity,
  UserCog,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { getApi } from '../../services/api';
import { PatientStatus, API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';

interface QueuePatient {
  id: string;
  fullName: string;
  age: number;
  sex: string;
  status: string;
  esiLevel: number | null;
  newsScore: number | null;
  finalOrientation: string | null;
  chiefComplaint: string | null;
  createdAt: string;
  waitMinutes: number;
  isCritical: boolean;
  retriageRequested: boolean;
  assignedBoxId: string | null;
  assignedDoctorId: string | null;
}

interface Queue {
  count: number;
  patients: QueuePatient[];
  longestWaitingId: string | null;
}

interface QueuesData {
  queues: {
    inscription: Queue;
    triage: Queue;
    waitingTreatment: Queue;
    inTreatment: Queue;
    withDoctor: Queue;
  };
  summary: {
    total: number;
    critical: number;
    retriageRequested: number;
  };
}

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}min`;
};

const getEsiBadgeVariant = (esi: number | null): 'destructive' | 'warning' | 'default' | 'secondary' | 'success' => {
  if (!esi) return 'secondary';
  switch (esi) {
    case 1: return 'destructive';
    case 2: return 'destructive';
    case 3: return 'warning';
    case 4: return 'default';
    case 5: return 'success';
    default: return 'secondary';
  }
};

interface QueueCardProps {
  title: string;
  icon: React.ReactNode;
  queue: Queue;
  color: string;
  onPatientClick: (patientId: string) => void;
  emptyMessage: string;
}

function QueueCard({ title, icon, queue, color, onPatientClick, emptyMessage }: QueueCardProps) {
  const sortedPatients = [...queue.patients].sort((a, b) => {
    // Critical patients first
    if (a.isCritical && !b.isCritical) return -1;
    if (!a.isCritical && b.isCritical) return 1;
    // Then by wait time (longest first)
    return b.waitMinutes - a.waitMinutes;
  });

  return (
    <Card className={`border-l-4 ${color}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          <Badge variant="outline" className="text-lg px-3 py-1">
            {queue.count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {queue.patients.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">{emptyMessage}</p>
        ) : (
          <div className="space-y-2 max-h-[200px] sm:max-h-[300px] overflow-y-auto">
            {sortedPatients.map((patient) => (
              <div
                key={patient.id}
                onClick={() => onPatientClick(patient.id)}
                className={`p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors ${
                  patient.isCritical ? 'bg-red-50 border-red-200' : 'bg-white'
                } ${patient.id === queue.longestWaitingId ? 'ring-2 ring-orange-400' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{patient.fullName}</span>
                      {patient.isCritical && (
                        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      {patient.retriageRequested && (
                        <Badge variant="warning" className="text-xs">Re-triage</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <span>{patient.age} ans</span>
                      {patient.esiLevel && (
                        <Badge variant={getEsiBadgeVariant(patient.esiLevel)} className="text-xs">
                          ESI {patient.esiLevel}
                        </Badge>
                      )}
                      {patient.chiefComplaint && (
                        <span className="truncate max-w-[100px] sm:max-w-[150px]">{patient.chiefComplaint}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <div className={`flex items-center gap-1 ${
                      patient.waitMinutes > 60 ? 'text-red-600' :
                      patient.waitMinutes > 30 ? 'text-orange-600' : 'text-gray-600'
                    }`}>
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">{formatWaitTime(patient.waitMinutes)}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function QueueManagement() {
  const navigate = useNavigate();
  const [data, setData] = useState<QueuesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadQueues = async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.stats.queues);
      setData(response.data);
    } catch (error) {
      console.error('Error loading queues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadQueues();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handlePatientClick = (patientId: string) => {
    // Navigate to appropriate detail view based on patient status
    navigate(CLIENT_ROUTES.supervisor.patientDetail(patientId));
  };

  if (loading && !data) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Gestion des Files d'Attente
            </h1>
            <p className="text-gray-600">
              Vue d'ensemble des patients par étape du parcours
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </Button>
            <Button variant="outline" onClick={loadQueues} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total en Urgences</p>
                    <p className="text-3xl font-bold">{data.summary.total}</p>
                  </div>
                  <Users className="h-10 w-10 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={data.summary.critical > 0 ? 'border-red-200 bg-red-50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Patients Critiques</p>
                    <p className="text-3xl font-bold text-red-600">{data.summary.critical}</p>
                    <p className="text-xs text-gray-500 mt-1">ESI 1-2 ou NEWS &ge; 7</p>
                  </div>
                  <AlertTriangle className="h-10 w-10 text-red-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={data.summary.retriageRequested > 0 ? 'border-orange-200 bg-orange-50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Demandes Re-triage</p>
                    <p className="text-3xl font-bold text-orange-600">{data.summary.retriageRequested}</p>
                  </div>
                  <AlertCircle className="h-10 w-10 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Queue Cards */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <QueueCard
              title="File d'Inscription"
              icon={<ClipboardList className="h-5 w-5" />}
              queue={data.queues.inscription}
              color="border-l-blue-500"
              onPatientClick={handlePatientClick}
              emptyMessage="Aucun patient en attente d'inscription"
            />

            <QueueCard
              title="En Triage"
              icon={<Stethoscope className="h-5 w-5" />}
              queue={data.queues.triage}
              color="border-l-yellow-500"
              onPatientClick={handlePatientClick}
              emptyMessage="Aucun patient en triage"
            />

            <QueueCard
              title="Attente Traitement"
              icon={<Clock className="h-5 w-5" />}
              queue={data.queues.waitingTreatment}
              color="border-l-orange-500"
              onPatientClick={handlePatientClick}
              emptyMessage="Aucun patient en attente de traitement"
            />

            <QueueCard
              title="En Traitement"
              icon={<Activity className="h-5 w-5" />}
              queue={data.queues.inTreatment}
              color="border-l-green-500"
              onPatientClick={handlePatientClick}
              emptyMessage="Aucun patient en traitement"
            />

            <QueueCard
              title="Avec Médecin"
              icon={<UserCog className="h-5 w-5" />}
              queue={data.queues.withDoctor}
              color="border-l-purple-500"
              onPatientClick={handlePatientClick}
              emptyMessage="Aucun patient avec médecin"
            />
          </div>
        )}

        {/* Legend */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Patient critique (ESI 1-2 / NEWS &ge; 7)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded ring-2 ring-orange-400" />
                <span>Plus longue attente dans la file</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="warning" className="text-xs">Re-triage</Badge>
                <span>Demande de re-triage</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-600" />
                <span className="text-red-600">&gt; 1h d'attente</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
