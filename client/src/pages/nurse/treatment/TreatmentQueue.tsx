import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search, RefreshCw, Users, Activity, HeartPulse } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { getApi } from '../../../services/api';
import { Patient, PatientStatus } from '@ncdss/shared';
import { formatDateTime } from '../../../utils/dateUtils';

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Orientation labels in French
const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumato',
  PEDIATRIC: 'Pédiatrie',
};

// Status labels and colors
const statusConfig: Record<string, { label: string; color: string }> = {
  TRIAGED: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  IN_TREATMENT: { label: 'En soins', color: 'bg-purple-100 text-purple-800' },
  WITH_DOCTOR: { label: 'Avec médecin', color: 'bg-blue-100 text-blue-800' },
};

export default function TreatmentQueue() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'waiting' | 'inTreatment' | 'all'>('waiting');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadPatients();

    // Auto-refresh every 15 seconds
    const interval = setInterval(() => {
      loadPatients();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const loadPatients = async () => {
    try {
      const api = await getApi();

      // Always load all relevant statuses for accurate stats
      const statusParams = [PatientStatus.TRIAGED, PatientStatus.IN_TREATMENT, PatientStatus.WITH_DOCTOR];

      const response = await api.get('/patients', {
        params: { status: statusParams },
      });

      // Sort by ESI (lower = more urgent) then by triageCompletedAt (older first)
      const sorted = (response.data as Patient[]).sort((a, b) => {
        // ESI comparison (1 is most urgent)
        const esiA = a.esiLevel ?? 5;
        const esiB = b.esiLevel ?? 5;
        if (esiA !== esiB) {
          return esiA - esiB;
        }
        // Time comparison (older = waited longer = more priority)
        const timeA = a.triageCompletedAt ? new Date(a.triageCompletedAt).getTime() : 0;
        const timeB = b.triageCompletedAt ? new Date(b.triageCompletedAt).getTime() : 0;
        return timeA - timeB;
      });

      setPatients(sorted);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter by status tab and search term
  const filteredPatients = patients.filter((p) => {
    // Apply status filter based on selected tab
    if (filter === 'waiting' && p.status !== PatientStatus.TRIAGED) return false;
    if (filter === 'inTreatment' && p.status !== PatientStatus.IN_TREATMENT) return false;
    // 'all' shows all statuses

    // Apply search filter
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(searchLower) ||
      (p.chiefComplaint && p.chiefComplaint.toLowerCase().includes(searchLower)) ||
      (p.nationalId && p.nationalId.toLowerCase().includes(searchLower))
    );
  });

  // Calculate stats
  const waitingCount = patients.filter((p) => p.status === PatientStatus.TRIAGED).length;
  const inTreatmentCount = patients.filter(
    (p) => p.status === PatientStatus.IN_TREATMENT || p.status === PatientStatus.WITH_DOCTOR
  ).length;
  const criticalCount = patients.filter((p) => (p.esiLevel ?? 5) <= 2).length;

  const handleStartTreatment = (patientId: string) => {
    // Navigate to patient care page which handles box assignment for TRIAGED patients
    navigate(`/nurse/treatment/${patientId}/care`);
  };

  const handleViewPatient = (patientId: string) => {
    navigate(`/nurse/treatment/${patientId}/care`);
  };

  const columns: Column<Patient>[] = [
    {
      key: 'esiLevel',
      header: 'ESI',
      width: '8%',
      render: (p) => (
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${esiColors[p.esiLevel ?? 5]}`}
        >
          {p.esiLevel ?? '—'}
        </span>
      ),
    },
    {
      key: 'fullName',
      header: 'Patient',
      width: '22%',
      render: (p) => (
        <div>
          <div className="font-medium">{p.fullName}</div>
          <div className="text-sm text-gray-500">
            {p.age} ans, {p.sex === 'MALE' ? 'H' : 'F'}
          </div>
        </div>
      ),
    },
    {
      key: 'chiefComplaint',
      header: 'Motif',
      width: '20%',
      render: (p) => (
        <div className="truncate max-w-[200px]" title={p.chiefComplaint || ''}>
          {p.chiefComplaint || <span className="text-gray-400">—</span>}
        </div>
      ),
    },
    {
      key: 'finalOrientation',
      header: 'Orientation',
      width: '12%',
      render: (p) =>
        p.finalOrientation ? (
          <Badge variant="outline">{orientationLabels[p.finalOrientation] || p.finalOrientation}</Badge>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'newsScore',
      header: 'NEWS',
      width: '8%',
      render: (p) => {
        const score = p.newsScore ?? null;
        if (score === null) return <span className="text-gray-400">—</span>;

        let colorClass = 'text-green-600';
        if (score >= 7) colorClass = 'text-red-600 font-bold';
        else if (score >= 5) colorClass = 'text-orange-600 font-semibold';

        return <span className={colorClass}>{score}</span>;
      },
    },
    {
      key: 'status',
      header: 'Statut',
      width: '12%',
      render: (p) => {
        const config = statusConfig[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-800' };
        return <span className={`px-2 py-1 rounded text-xs font-medium ${config.color}`}>{config.label}</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      width: '18%',
      render: (p) => (
        <div className="flex gap-2 justify-end">
          {p.status === PatientStatus.TRIAGED ? (
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
              onClick={(e) => {
                e.stopPropagation();
                handleStartTreatment(p.id);
              }}
            >
              Prendre en charge
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleViewPatient(p.id);
              }}
            >
              Voir
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">File de Soins</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Actualisation auto: 15s</span>
            <Button variant="ghost" size="sm" onClick={loadPatients} title="Actualiser maintenant">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* En attente */}
          <Card
            className={`cursor-pointer transition-all ${filter === 'waiting' ? 'ring-2 ring-yellow-500' : 'hover:shadow-md'}`}
            onClick={() => setFilter('waiting')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">En attente</p>
                  <p className="text-3xl font-bold text-yellow-600">{waitingCount}</p>
                </div>
                <Users className="h-10 w-10 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          {/* En soins */}
          <Card
            className={`cursor-pointer transition-all ${filter === 'inTreatment' ? 'ring-2 ring-purple-500' : 'hover:shadow-md'}`}
            onClick={() => setFilter('inTreatment')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">En soins</p>
                  <p className="text-3xl font-bold text-purple-600">{inTreatmentCount}</p>
                </div>
                <Activity className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          {/* Critiques */}
          <Card
            className={`cursor-pointer transition-all ${filter === 'all' ? 'ring-2 ring-red-500' : 'hover:shadow-md'}`}
            onClick={() => setFilter('all')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Critiques (ESI 1-2)</p>
                  <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
                </div>
                <HeartPulse className="h-10 w-10 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <Card className="mb-4 border-red-300 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-800">
                    {criticalCount} patient{criticalCount > 1 ? 's' : ''} critique{criticalCount > 1 ? 's' : ''} en
                    attente!
                  </p>
                  <p className="text-sm text-red-700">
                    ESI 1-2 requiert une prise en charge immédiate. Priorisez ces patients.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un patient (nom, CIN, motif)..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={filteredPatients}
            loading={loading}
            keyExtractor={(p) => p.id}
            onRowClick={(p) => handleViewPatient(p.id)}
            emptyMessage="Aucun patient dans la file"
          />
        </div>

        {/* Info footer */}
        {filteredPatients.length === 0 && !loading && (
          <Card className="mt-4 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Aucun patient dans cette catégorie</p>
                  <p>
                    {filter === 'waiting'
                      ? 'Aucun patient en attente de soins.'
                      : filter === 'inTreatment'
                        ? 'Aucun patient actuellement en soins.'
                        : 'Aucun patient à afficher.'}
                  </p>
                  <p className="mt-1 text-blue-600">Dernière actualisation: {formatDateTime(lastRefresh.toISOString())}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
