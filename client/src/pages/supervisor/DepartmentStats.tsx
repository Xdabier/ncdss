import React, { useState, useEffect } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Users,
  Clock,
  Activity,
  AlertTriangle,
  LogOut,
  Download,
  RefreshCw,
  Loader2,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getApi } from '../../services/api';

interface DashboardStats {
  today: {
    total: number;
    waitingTriage: number;
    inTriage: number;
    waitingTreatment: number;
    inTreatment: number;
    discharged: number;
    critical: number;
  };
  resources: {
    activeStaff: number;
    activeBoxes: number;
  };
  performance: {
    avgTriageMinutes: number;
    avgWaitMinutes: number;
  };
  charts: {
    esiDistribution: { esi: number; count: number; name: string }[];
    orientationDistribution: { orientation: string; count: number }[];
    patientsByHour: { hour: number; count: number; label: string }[];
    avgTimeByOrientation: { orientation: string; avgMinutes: number }[];
  };
}

const ESI_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
const ORIENTATION_COLORS: Record<string, string> = {
  SAUV: '#ef4444',
  MEDICAL: '#3b82f6',
  SURGICAL: '#8b5cf6',
  TRAUMA: '#f97316',
  PEDIATRIC: '#22c55e',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
  PEDIATRIC: 'Pédiatrique',
};

export default function DepartmentStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [shift, setShift] = useState<string>('all');

  const loadStats = async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      if (shift !== 'all') {
        params.append('shift', shift);
      }
      const response = await api.get(`/stats/dashboard?${params.toString()}`);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [startDate, endDate, shift]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const api = await getApi();
      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      const response = await api.get(`/stats/export?${params.toString()}`);

      // Convert to CSV
      const data = response.data;
      if (!data.length) {
        alert('Aucune donnée à exporter');
        return;
      }

      const headers = [
        'ID', 'Nom', 'Age', 'Sexe', 'Statut', 'ESI', 'NEWS', 'GCS', 'qSOFA',
        'Orientation', 'Motif', 'Arrivée', 'Début Triage', 'Fin Triage',
        'Début Traitement', 'Sortie', 'Type Sortie', 'Attente Triage (min)',
        'Durée Triage (min)', 'Passage Total (min)'
      ];

      const csvRows = [headers.join(',')];

      data.forEach((p: any) => {
        const row = [
          p.id,
          `"${p.fullName}"`,
          p.age,
          p.sex,
          p.status,
          p.esiLevel || '',
          p.newsScore || '',
          p.gcsScore || '',
          p.qsofaScore || '',
          p.finalOrientation || '',
          `"${p.chiefComplaint || ''}"`,
          p.createdAt,
          p.triageStartedAt || '',
          p.triageCompletedAt || '',
          p.treatmentStartedAt || '',
          p.dischargedAt || '',
          p.dischargeType || '',
          p.triageWaitMinutes || '',
          p.triageDurationMinutes || '',
          p.totalPassageMinutes || ''
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stats_${startDate}_${endDate}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  if (loading && !stats) {
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
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Statistiques du Service
            </h1>
            <p className="text-gray-600">
              Analyse des performances et de l'activité
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadStats} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="startDate">Date de début</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="endDate">Date de fin</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Vacation</Label>
                <Select value={shift} onValueChange={setShift}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Toutes les vacations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les vacations</SelectItem>
                    <SelectItem value="MORNING">Matin (7h-14h)</SelectItem>
                    <SelectItem value="AFTERNOON">Après-midi (14h-21h)</SelectItem>
                    <SelectItem value="NIGHT">Nuit (21h-7h)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Patients Aujourd'hui</p>
                    <p className="text-2xl font-bold">{stats.today.total}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">En Attente Triage</p>
                    <p className="text-2xl font-bold">{stats.today.waitingTriage}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">En Traitement</p>
                    <p className="text-2xl font-bold">{stats.today.inTreatment}</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Temps d'Attente Moy.</p>
                    <p className="text-2xl font-bold">{formatMinutes(stats.performance.avgWaitMinutes)}</p>
                  </div>
                  <Clock className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Sorties Aujourd'hui</p>
                    <p className="text-2xl font-bold">{stats.today.discharged}</p>
                  </div>
                  <LogOut className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Critical Alert */}
        {stats && stats.today.critical > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="font-semibold text-red-700">
                    {stats.today.critical} patient(s) critique(s)
                  </p>
                  <p className="text-sm text-red-600">
                    ESI 1-2 ou NEWS &ge; 7 - Nécessite une attention immédiate
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Patients by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Patients par Heure
                </CardTitle>
                <CardDescription>Distribution horaire des arrivées</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.charts.patientsByHour.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={stats.charts.patientsByHour}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Patients"
                        dot={{ fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ESI Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition par ESI</CardTitle>
                <CardDescription>Niveaux de gravité des patients triés</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.charts.esiDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={stats.charts.esiDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                        }
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {stats.charts.esiDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={ESI_COLORS[entry.esi - 1] || '#9ca3af'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Orientation Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Répartition par Orientation</CardTitle>
                <CardDescription>Distribution des patients par service</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.charts.orientationDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.charts.orientationDistribution.map(o => ({
                      ...o,
                      label: orientationLabels[o.orientation] || o.orientation
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Patients">
                        {stats.charts.orientationDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={ORIENTATION_COLORS[entry.orientation] || '#9ca3af'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Average Time by Orientation */}
            <Card>
              <CardHeader>
                <CardTitle>Temps de Passage Moyen</CardTitle>
                <CardDescription>Par orientation (patients sortis)</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.charts.avgTimeByOrientation.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.charts.avgTimeByOrientation.map(t => ({
                      ...t,
                      label: orientationLabels[t.orientation] || t.orientation,
                      avgHours: Math.round(t.avgMinutes / 60 * 10) / 10
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis
                        label={{ value: 'Heures', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        formatter={(value) => [`${value}h`, 'Temps moyen']}
                      />
                      <Bar dataKey="avgHours" name="Temps moyen (h)">
                        {stats.charts.avgTimeByOrientation.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={ORIENTATION_COLORS[entry.orientation] || '#9ca3af'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-500">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Additional Performance Metrics */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Indicateurs de Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Temps Triage Moyen</p>
                  <p className="text-xl font-bold text-blue-600">
                    {formatMinutes(stats.performance.avgTriageMinutes)}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Personnel Actif</p>
                  <p className="text-xl font-bold text-green-600">
                    {stats.resources.activeStaff}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Boxes Actifs</p>
                  <p className="text-xl font-bold text-purple-600">
                    {stats.resources.activeBoxes}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Taux de Sortie</p>
                  <p className="text-xl font-bold text-orange-600">
                    {stats.today.total > 0
                      ? `${Math.round((stats.today.discharged / stats.today.total) * 100)}%`
                      : '0%'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
