import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  Users,
  Activity,
  HeartPulse,
  Clock,
  Search,
  AlertTriangle,
  Monitor,
  Stethoscope,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { getApi } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole, API_ROUTES } from '@ncdss/shared';

// Types for tracking board data
interface TrackingPatient {
  id: string;
  fullName: string;
  age: number | null;
  sex: string | null;
  nationalId: string | null;
  chiefComplaint: string | null;
  status: string;
  esiLevel: number | null;
  newsScore: number | null;
  gcsScore: number | null;
  finalOrientation: string | null;
  createdAt: string;
  triageStartedAt: string | null;
  triageCompletedAt: string | null;
  treatmentStartedAt: string | null;
  assignedBoxId: string | null;
  assignedDoctorId: string | null;
  retriageRequested: boolean | null;
  boxName: string | null;
  boxType: string | null;
  doctorName: string | null;
  timeInDeptMinutes: number;
  timeInDeptFormatted: string;
  isOverdue: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

interface TrackingStats {
  byStatus: Record<string, number>;
  byEsi: Record<string, number>;
  critical: number;
  total: number;
}

type FilterType = 'all' | 'critical' | 'waiting' | 'mine';

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Status labels and colors
const statusConfig: Record<string, { label: string; color: string }> = {
  REGISTERED: { label: 'Inscrit', color: 'bg-gray-100 text-gray-800' },
  IN_TRIAGE: { label: 'En triage', color: 'bg-indigo-100 text-indigo-800' },
  TRIAGED: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  IN_TREATMENT: { label: 'En soins', color: 'bg-purple-100 text-purple-800' },
  WITH_DOCTOR: { label: 'Avec médecin', color: 'bg-blue-100 text-blue-800' },
  DISCHARGED: { label: 'Sorti', color: 'bg-green-100 text-green-800' },
};

// Orientation labels
const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumato',
  PEDIATRIC: 'Pédiatrie',
};

export default function TrackingBoard() {
  const [patients, setPatients] = useState<TrackingPatient[]>([]);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const api = await getApi();
      const [boardRes, statsRes] = await Promise.all([
        api.get(API_ROUTES.tracking.board),
        api.get(API_ROUTES.tracking.stats),
      ]);
      setPatients(boardRes.data);
      setStats(statsRes.data);
      setLastRefresh(new Date());
      setSecondsSinceRefresh(0);
    } catch (err) {
      console.error('Error loading tracking data:', err);
      setError('Erreur de chargement du tableau de suivi');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Update "seconds since refresh" counter
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsSinceRefresh((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Filter patients
  const filteredPatients = patients.filter((p) => {
    // Apply tab filter
    if (filter === 'critical' && !p.isCritical) return false;
    if (filter === 'waiting' && !['REGISTERED', 'TRIAGED'].includes(p.status)) return false;
    if (filter === 'mine' && p.assignedDoctorId !== user?.id) return false;

    // Apply search
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(s) ||
      (p.chiefComplaint && p.chiefComplaint.toLowerCase().includes(s)) ||
      (p.nationalId && p.nationalId.toLowerCase().includes(s)) ||
      (p.boxName && p.boxName.toLowerCase().includes(s)) ||
      (p.doctorName && p.doctorName.toLowerCase().includes(s))
    );
  });

  // Stat counts from API
  const waitingCount = (stats?.byStatus['REGISTERED'] || 0) + (stats?.byStatus['TRIAGED'] || 0);
  const inTriageCount = stats?.byStatus['IN_TRIAGE'] || 0;
  const inCareCount =
    (stats?.byStatus['IN_TREATMENT'] || 0) + (stats?.byStatus['WITH_DOCTOR'] || 0);
  const criticalCount = stats?.critical || 0;

  const handleRowClick = (p: TrackingPatient) => {
    // Navigate based on user role
    if (user?.role === UserRole.DOCTOR || user?.role === UserRole.SUPER_ADMIN) {
      navigate(`/doctor/patients/${p.id}`);
    } else if (
      user?.role === UserRole.NURSE ||
      user?.role === UserRole.NURSE_SUPERVISOR
    ) {
      if (['IN_TREATMENT', 'WITH_DOCTOR'].includes(p.status)) {
        navigate(`/nurse/treatment/${p.id}`);
      } else {
        navigate(`/nurse/triage/${p.id}/abcde`);
      }
    } else {
      navigate(`/patients/${p.id}/timeline`);
    }
  };

  const columns: Column<TrackingPatient>[] = [
    {
      key: 'esiLevel',
      header: 'ESI',
      width: '5%',
      render: (p) => (
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${esiColors[p.esiLevel ?? 5] || 'bg-gray-300 text-gray-700'}`}
        >
          {p.esiLevel ?? '—'}
        </span>
      ),
    },
    {
      key: 'fullName',
      header: 'Patient',
      width: '16%',
      render: (p) => (
        <div>
          <div className="font-medium">{p.fullName}</div>
          <div className="text-xs text-gray-500">
            {p.age != null ? `${p.age} ans` : '—'}{p.sex ? `, ${p.sex === 'MALE' ? 'H' : 'F'}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'boxName',
      header: 'Box',
      width: '8%',
      render: (p) =>
        p.boxName ? (
          <Badge variant="outline" className="font-mono text-xs">
            {p.boxName}
          </Badge>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      key: 'chiefComplaint',
      header: 'Motif',
      width: '16%',
      render: (p) => (
        <div className="truncate max-w-[200px]" title={p.chiefComplaint || ''}>
          {p.chiefComplaint || <span className="text-gray-400">—</span>}
        </div>
      ),
    },
    {
      key: 'finalOrientation',
      header: 'Orientation',
      width: '9%',
      render: (p) =>
        p.finalOrientation ? (
          <Badge variant="outline" className="text-xs">
            {orientationLabels[p.finalOrientation] || p.finalOrientation}
          </Badge>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      key: 'timeInDeptFormatted',
      header: 'Temps',
      width: '8%',
      render: (p) => {
        let colorClass = 'text-green-700';
        if (p.isOverdue) colorClass = 'text-red-600 font-bold';
        else if (p.isWarning) colorClass = 'text-yellow-600 font-semibold';

        return (
          <div className="flex items-center gap-1">
            <Clock className={`h-3 w-3 ${p.isOverdue ? 'text-red-500' : p.isWarning ? 'text-yellow-500' : 'text-green-500'}`} />
            <span className={`text-sm ${colorClass}`}>{p.timeInDeptFormatted}</span>
          </div>
        );
      },
    },
    {
      key: 'scores',
      header: 'Scores',
      width: '10%',
      render: (p) => {
        if (p.newsScore == null && p.gcsScore == null) {
          return <span className="text-gray-400 text-xs">—</span>;
        }
        return (
          <div className="text-xs space-y-0.5">
            {p.newsScore != null && (
              <div>
                <span className="text-gray-500">NEWS:</span>{' '}
                <span
                  className={
                    p.newsScore >= 7
                      ? 'text-red-600 font-bold'
                      : p.newsScore >= 5
                        ? 'text-orange-600 font-semibold'
                        : 'text-green-600'
                  }
                >
                  {p.newsScore}
                </span>
              </div>
            )}
            {p.gcsScore != null && (
              <div>
                <span className="text-gray-500">GCS:</span>{' '}
                <span className={p.gcsScore < 9 ? 'text-red-600 font-bold' : ''}>
                  {p.gcsScore}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'doctorName',
      header: 'Médecin',
      width: '12%',
      render: (p) => {
        if (!p.doctorName) {
          return <span className="text-gray-400 text-xs">Non assigné</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <Stethoscope className="h-3 w-3 flex-shrink-0 text-green-500" />
            <span className="text-green-700 text-sm font-medium truncate">
              Dr. {p.doctorName}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Statut',
      width: '10%',
      render: (p) => {
        const config = statusConfig[p.status] || {
          label: p.status,
          color: 'bg-gray-100 text-gray-800',
        };
        return (
          <div className="flex flex-col gap-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium inline-block w-fit ${config.color}`}>
              {config.label}
            </span>
            {p.retriageRequested && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 inline-block w-fit">
                Re-triage
              </span>
            )}
          </div>
        );
      },
    },
  ];

  const now = new Date();
  const currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const currentDate = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Monitor className="h-7 w-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Tableau de Suivi - Urgences</h1>
              <p className="text-sm text-gray-500">
                {currentDate} &middot; {currentTime}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Mise à jour: il y a {secondsSinceRefresh}s
            </span>
            <Button variant="ghost" size="sm" onClick={loadData} title="Actualiser maintenant">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card
            className={`cursor-pointer transition-all ${filter === 'waiting' ? 'ring-2 ring-yellow-500' : 'hover:shadow-md'}`}
            onClick={() => setFilter(filter === 'waiting' ? 'all' : 'waiting')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">En attente</p>
                  <p className="text-2xl font-bold text-yellow-600">{waitingCount}</p>
                </div>
                <Users className="h-8 w-8 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">En triage</p>
                  <p className="text-2xl font-bold text-indigo-600">{inTriageCount}</p>
                </div>
                <Activity className="h-8 w-8 text-indigo-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">En soins</p>
                  <p className="text-2xl font-bold text-purple-600">{inCareCount}</p>
                </div>
                <Stethoscope className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all ${filter === 'critical' ? 'ring-2 ring-red-500' : 'hover:shadow-md'}`}
            onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Critiques</p>
                  <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
                </div>
                <HeartPulse className="h-8 w-8 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <Card className="mb-4 border-red-300 bg-red-50">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 animate-pulse" />
                <p className="text-sm font-semibold text-red-800">
                  {criticalCount} patient{criticalCount > 1 ? 's' : ''} critique
                  {criticalCount > 1 ? 's' : ''} (ESI 1-2) — Prise en charge prioritaire
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
          {/* Filter tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {([
              { key: 'all', label: `Tous (${stats?.total || 0})` },
              { key: 'critical', label: `Critiques (${criticalCount})` },
              { key: 'waiting', label: `En attente (${waitingCount})` },
              ...(user?.role === UserRole.DOCTOR
                ? [{ key: 'mine', label: 'Mes patients' }]
                : []),
            ] as { key: FilterType; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (nom, motif, box, médecin)..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Patient Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={filteredPatients}
            loading={loading}
            keyExtractor={(p) => p.id}
            onRowClick={handleRowClick}
            emptyMessage="Aucun patient à afficher"
            emptyIcon={Users}
          />
        </div>

        {/* Footer info */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>
            {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''} affiché
            {filteredPatients.length !== 1 ? 's' : ''}
            {filter !== 'all' ? ` (filtre actif)` : ''}
          </span>
          <span>Actualisation automatique: 10s</span>
        </div>
      </div>
    </DashboardLayout>
  );
}
