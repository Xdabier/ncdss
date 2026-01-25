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
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Users,
  Search,
  Download,
  RefreshCw,
  Loader2,
  Eye,
  Clock,
  AlertTriangle,
  Filter,
  X,
} from 'lucide-react';
import { getApi } from '../../services/api';
import { PatientStatus, Orientation, Sex } from '@ncdss/shared';

interface PatientSummary {
  id: string;
  fullName: string;
  age: number;
  sex: string;
  nationalId: string | null;
  chiefComplaint: string | null;
  allergies: string | null;
  status: string;
  esiLevel: number | null;
  newsScore: number | null;
  gcsScore: number | null;
  qsofaScore: number | null;
  finalOrientation: string | null;
  suggestedOrientation: string | null;
  assignedDoctorId: string | null;
  assignedBoxId: string | null;
  createdAt: string;
  triageCompletedAt: string | null;
  treatmentStartedAt: string | null;
  doctorAssignedAt: string | null;
}

const statusLabels: Record<string, string> = {
  REGISTERED: 'Inscrit',
  IN_TRIAGE: 'En Triage',
  TRIAGED: 'Triagé',
  IN_TREATMENT: 'En Traitement',
  WITH_DOCTOR: 'Avec Médecin',
  DISCHARGED: 'Sorti',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  REGISTERED: 'info',
  IN_TRIAGE: 'warning',
  TRIAGED: 'secondary',
  IN_TREATMENT: 'default',
  WITH_DOCTOR: 'success',
  DISCHARGED: 'outline',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
  PEDIATRIC: 'Pédiatrique',
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

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const calculatePassageTime = (patient: PatientSummary): string => {
  const start = new Date(patient.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}min`;
};

export default function AllPatients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [esiFilter, setEsiFilter] = useState<string>('all');
  const [orientationFilter, setOrientationFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [showFilters, setShowFilters] = useState(false);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const params = new URLSearchParams();

      if (search) params.append('search', search);
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (dateFilter) {
        params.append('today', 'true');
      }
      params.append('limit', '200');

      const response = await api.get(`/patients?${params.toString()}`);

      // Apply client-side filters for ESI and Orientation
      let filtered = response.data;

      if (esiFilter && esiFilter !== 'all') {
        filtered = filtered.filter((p: PatientSummary) =>
          p.esiLevel === parseInt(esiFilter)
        );
      }

      if (orientationFilter && orientationFilter !== 'all') {
        filtered = filtered.filter((p: PatientSummary) =>
          p.finalOrientation === orientationFilter
        );
      }

      setPatients(filtered);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [search, statusFilter, esiFilter, orientationFilter, dateFilter]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const headers = [
        'ID', 'Nom', 'Age', 'Sexe', 'Statut', 'ESI', 'NEWS', 'GCS', 'qSOFA',
        'Orientation', 'Motif', 'Allergies', 'Arrivée', 'Temps de passage'
      ];

      const csvRows = [headers.join(',')];

      patients.forEach((p) => {
        const row = [
          p.id,
          `"${p.fullName}"`,
          p.age,
          p.sex === 'MALE' ? 'M' : 'F',
          statusLabels[p.status] || p.status,
          p.esiLevel || '',
          p.newsScore || '',
          p.gcsScore || '',
          p.qsofaScore || '',
          p.finalOrientation ? orientationLabels[p.finalOrientation] || p.finalOrientation : '',
          `"${p.chiefComplaint || ''}"`,
          `"${p.allergies || ''}"`,
          formatDateTime(p.createdAt),
          calculatePassageTime(p)
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `patients_${dateFilter}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setEsiFilter('all');
    setOrientationFilter('all');
    const today = new Date();
    setDateFilter(today.toISOString().split('T')[0]);
  };

  const hasActiveFilters = search || statusFilter !== 'all' || esiFilter !== 'all' || orientationFilter !== 'all';

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Tous les Patients
            </h1>
            <p className="text-gray-600">
              Liste complète des patients aux urgences
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={hasActiveFilters ? 'border-blue-500' : ''}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres
              {hasActiveFilters && (
                <Badge variant="info" className="ml-2">Actifs</Badge>
              )}
            </Button>
            <Button variant="outline" onClick={loadPatients} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button onClick={handleExport} disabled={exporting || patients.length === 0}>
              <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-spin' : ''}`} />
              Exporter CSV
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="search">Rechercher</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      type="text"
                      placeholder="Nom du patient..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Statut</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Niveau ESI</Label>
                  <Select value={esiFilter} onValueChange={setEsiFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Tous les niveaux" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les niveaux</SelectItem>
                      <SelectItem value="1">ESI 1 - Critique</SelectItem>
                      <SelectItem value="2">ESI 2 - Urgent</SelectItem>
                      <SelectItem value="3">ESI 3 - Semi-urgent</SelectItem>
                      <SelectItem value="4">ESI 4 - Peu urgent</SelectItem>
                      <SelectItem value="5">ESI 5 - Non urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Orientation</Label>
                  <Select value={orientationFilter} onValueChange={setOrientationFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Toutes les orientations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les orientations</SelectItem>
                      {Object.entries(orientationLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="dateFilter">Date d'arrivée</Label>
                  <Input
                    id="dateFilter"
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Effacer les filtres
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-500" />
            <span className="text-gray-600">
              {patients.length} patient(s) trouvé(s)
            </span>
          </div>
        </div>

        {/* Patients Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : patients.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Aucun patient trouvé</p>
                {hasActiveFilters && (
                  <Button variant="link" onClick={clearFilters} className="mt-2">
                    Effacer les filtres
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nom
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Âge
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ESI
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orientation
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Arrivée
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Passage
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {patients.map((patient) => {
                      const isCritical = (patient.esiLevel && patient.esiLevel <= 2) ||
                        (patient.newsScore && patient.newsScore >= 7);

                      return (
                        <tr
                          key={patient.id}
                          className={`hover:bg-gray-50 ${isCritical ? 'bg-red-50' : ''}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-gray-900 flex items-center gap-1">
                                  {patient.fullName}
                                  {isCritical && (
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                  )}
                                </div>
                                {patient.chiefComplaint && (
                                  <div className="text-sm text-gray-500 truncate max-w-[200px]">
                                    {patient.chiefComplaint}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-gray-900">
                              {patient.age} ans
                            </span>
                            <span className="text-sm text-gray-500 ml-1">
                              ({patient.sex === 'MALE' ? 'M' : 'F'})
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant={statusColors[patient.status] || 'default'}>
                              {statusLabels[patient.status] || patient.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {patient.esiLevel ? (
                              <Badge variant={getEsiBadgeVariant(patient.esiLevel)}>
                                ESI {patient.esiLevel}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {patient.finalOrientation ? (
                              <span className="text-sm">
                                {orientationLabels[patient.finalOrientation] || patient.finalOrientation}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatTime(patient.createdAt)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(patient.createdAt).toLocaleDateString('fr-FR')}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-4 w-4 text-gray-400" />
                              {calculatePassageTime(patient)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/supervisor/patients/${patient.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Footer */}
        {patients.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <span className="text-gray-500">Total:</span>
                  <span className="ml-2 font-medium">{patients.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">Critiques (ESI 1-2):</span>
                  <span className="ml-2 font-medium text-red-600">
                    {patients.filter(p => p.esiLevel && p.esiLevel <= 2).length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">En attente triage:</span>
                  <span className="ml-2 font-medium">
                    {patients.filter(p => p.status === 'REGISTERED').length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">En traitement:</span>
                  <span className="ml-2 font-medium">
                    {patients.filter(p => p.status === 'IN_TREATMENT' || p.status === 'WITH_DOCTOR').length}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Sortis:</span>
                  <span className="ml-2 font-medium">
                    {patients.filter(p => p.status === 'DISCHARGED').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
