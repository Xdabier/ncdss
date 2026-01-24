import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getApi } from '../../services/api';
import { Patient, PatientStatus, Sex } from '@ncdss/shared';
import {
  Users,
  Clock,
  AlertTriangle,
  Eye,
  UserPlus,
  Search,
  RefreshCw
} from 'lucide-react';

type FilterTab = 'mine' | 'waiting';

interface PatientListItem extends Patient {
  // Full patient data from API
}

export default function MyPatients() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('mine');
  const [search, setSearch] = useState('');
  const [takingPatient, setTakingPatient] = useState<string | null>(null);

  // Stats
  const myPatients = patients.filter(p => p.assignedDoctorId === user?.id);
  const waitingPatients = patients.filter(
    p => (p.status === PatientStatus.IN_TREATMENT || p.status === PatientStatus.WITH_DOCTOR) &&
         !p.assignedDoctorId
  );
  const criticalPatients = patients.filter(
    p => p.esiLevel && p.esiLevel <= 2 &&
         (p.assignedDoctorId === user?.id || !p.assignedDoctorId)
  );

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      // Fetch all patients that are relevant for doctors
      // IN_TREATMENT = waiting for doctor assignment
      // WITH_DOCTOR = with a doctor
      const params = new URLSearchParams();
      params.append('status', PatientStatus.IN_TREATMENT);
      params.append('status', PatientStatus.WITH_DOCTOR);
      params.append('today', 'true');
      params.append('limit', '100');

      const response = await api.get(`/patients?${params.toString()}`);
      setPatients(response.data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadPatients, 30000);
    return () => clearInterval(interval);
  }, [loadPatients]);

  const handleTakePatient = async (patientId: string) => {
    if (!user?.id) return;

    setTakingPatient(patientId);
    try {
      const api = await getApi();
      await api.post(`/patients/${patientId}/transfer-to-doctor`, {
        doctorId: user.id
      });
      await loadPatients();
    } catch (error) {
      console.error('Error taking patient:', error);
    } finally {
      setTakingPatient(null);
    }
  };

  // Filter patients based on active tab and search
  const filteredPatients = (activeTab === 'mine' ? myPatients : waitingPatients)
    .filter(p => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        p.fullName.toLowerCase().includes(searchLower) ||
        p.chiefComplaint?.toLowerCase().includes(searchLower) ||
        p.nationalId?.toLowerCase().includes(searchLower)
      );
    })
    // Sort by ESI (ascending) then by time
    .sort((a, b) => {
      const esiA = a.esiLevel || 5;
      const esiB = b.esiLevel || 5;
      if (esiA !== esiB) return esiA - esiB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  // ESI badge colors
  const getEsiBadge = (esi: number | undefined) => {
    if (!esi) return <Badge variant="secondary">-</Badge>;
    const colors: Record<number, string> = {
      1: 'bg-red-600 text-white',
      2: 'bg-orange-500 text-white',
      3: 'bg-yellow-500 text-white',
      4: 'bg-green-500 text-white',
      5: 'bg-blue-500 text-white'
    };
    return (
      <Badge className={colors[esi] || 'bg-gray-500 text-white'}>
        ESI {esi}
      </Badge>
    );
  };

  // Status badge
  const getStatusBadge = (status: PatientStatus) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'info' | 'warning' | 'success' }> = {
      [PatientStatus.IN_TREATMENT]: { label: 'En soins', variant: 'info' },
      [PatientStatus.WITH_DOCTOR]: { label: 'Avec médecin', variant: 'success' }
    };
    const cfg = config[status] || { label: status, variant: 'secondary' };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  // Format patient info
  const formatPatientInfo = (patient: PatientListItem) => {
    const sex = patient.sex === Sex.MALE ? 'H' : 'F';
    return `${patient.age} ans, ${sex}`;
  };

  // Check if score is critical
  const isScoreCritical = (type: 'news' | 'gcs', value: number | undefined) => {
    if (value === undefined) return false;
    if (type === 'news') return value >= 7;
    if (type === 'gcs') return value < 9;
    return false;
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mes Patients</h1>
            <p className="text-gray-600 mt-1">
              Gestion des patients assignés et en attente
            </p>
          </div>
          <Button onClick={loadPatients} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Critical Alert Banner */}
        {criticalPatients.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800">
                {criticalPatients.length} patient{criticalPatients.length > 1 ? 's' : ''} critique{criticalPatients.length > 1 ? 's' : ''} (ESI 1-2)
              </h3>
              <p className="text-sm text-red-700">
                {criticalPatients.map(p => p.fullName).join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-l-blue-500"
            onClick={() => setActiveTab('mine')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Mes patients
              </CardTitle>
              <Users className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {myPatients.length}
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-l-yellow-500"
            onClick={() => setActiveTab('waiting')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                En attente
              </CardTitle>
              <Clock className="h-5 w-5 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {waitingPatients.length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Critiques (ESI 1-2)
              </CardTitle>
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {criticalPatients.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'mine' ? 'default' : 'outline'}
            onClick={() => setActiveTab('mine')}
          >
            Mes patients ({myPatients.length})
          </Button>
          <Button
            variant={activeTab === 'waiting' ? 'default' : 'outline'}
            onClick={() => setActiveTab('waiting')}
          >
            En attente ({waitingPatients.length})
          </Button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, motif ou CIN..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Patients Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {activeTab === 'mine' ? 'Patients assignés' : 'Patients en attente'}
              {' '}({filteredPatients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {activeTab === 'mine'
                    ? 'Aucun patient assigné'
                    : 'Aucun patient en attente'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ESI
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Motif
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orientation
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Scores
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPatients.map((patient) => (
                      <tr
                        key={patient.id}
                        className={`hover:bg-gray-50 ${
                          patient.esiLevel && patient.esiLevel <= 2
                            ? 'bg-red-50'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getEsiBadge(patient.esiLevel)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {patient.fullName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatPatientInfo(patient)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div
                            className="text-sm text-gray-900 max-w-xs truncate"
                            title={patient.chiefComplaint || '-'}
                          >
                            {patient.chiefComplaint
                              ? patient.chiefComplaint.length > 40
                                ? patient.chiefComplaint.substring(0, 40) + '...'
                                : patient.chiefComplaint
                              : '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {patient.finalOrientation || patient.suggestedOrientation || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`text-sm ${
                                isScoreCritical('news', patient.newsScore)
                                  ? 'text-red-600 font-bold'
                                  : 'text-gray-900'
                              }`}
                            >
                              NEWS: {patient.newsScore ?? '-'}
                            </span>
                            <span
                              className={`text-sm ${
                                isScoreCritical('gcs', patient.gcsScore)
                                  ? 'text-red-600 font-bold'
                                  : 'text-gray-900'
                              }`}
                            >
                              GCS: {patient.gcsScore ?? '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getStatusBadge(patient.status)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          {patient.assignedDoctorId === user?.id ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                navigate(`/doctor/patients/${patient.id}`)
                              }
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Voir
                            </Button>
                          ) : activeTab === 'waiting' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTakePatient(patient.id)}
                              disabled={takingPatient === patient.id}
                            >
                              {takingPatient === patient.id ? (
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <UserPlus className="h-4 w-4 mr-1" />
                              )}
                              Prendre
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
