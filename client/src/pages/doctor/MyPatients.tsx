import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useNotificationStore } from '../../stores/notification.store';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getApi } from '../../services/api';
import { Patient, PatientStatus, Sex, NotificationType, API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import {
  Users,
  Clock,
  AlertTriangle,
  Eye,
  UserPlus,
  Search,
  RefreshCw,
  List,
  Bell,
  X
} from 'lucide-react';

type FilterTab = 'mine' | 'waiting' | 'all';

interface PatientListItem extends Patient {
  // Full patient data from API
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'info' | 'warning';
}

export default function MyPatients() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { notifications } = useNotificationStore();
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialTab = (searchParams.get('tab') as FilterTab) || 'mine';
  const [activeTab, setActiveTab] = useState<FilterTab>(
    ['mine', 'waiting', 'all'].includes(initialTab) ? initialTab : 'mine'
  );
  const [search, setSearch] = useState('');
  const [takingPatient, setTakingPatient] = useState<string | null>(null);
  const [recentlyAssignedIds, setRecentlyAssignedIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const prevNotifCountRef = useRef<number>(0);
  const [now, setNow] = useState(() => new Date());

  // Update "now" every 30 seconds for waiting time display
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Stats
  const myPatients = patients.filter(p => p.assignedDoctorId === user?.id);
  const waitingPatients = patients.filter(
    p => (p.status === PatientStatus.IN_TREATMENT || p.status === PatientStatus.WITH_DOCTOR) &&
         !p.assignedDoctorId
  );
  const allRelevantPatients = patients;
  const criticalPatients = patients.filter(
    p => p.esiLevel && p.esiLevel <= 2 &&
         (p.assignedDoctorId === user?.id || !p.assignedDoctorId)
  );

  const loadPatients = useCallback(async (isInitial = false) => {
    if (isInitial) setInitialLoading(true);
    else setRefreshing(true);
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.list, { params: {
        status: [PatientStatus.IN_TREATMENT, PatientStatus.WITH_DOCTOR],
        limit: '100',
      } });
      const newPatients: PatientListItem[] = response.data;

      // Detect newly assigned patients (assigned in last 5 minutes)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const newlyAssigned = new Set(
        newPatients
          .filter(p =>
            p.assignedDoctorId === user?.id &&
            p.doctorAssignedAt &&
            p.doctorAssignedAt > fiveMinAgo
          )
          .map(p => p.id)
      );
      setRecentlyAssignedIds(newlyAssigned);
      setPatients(newPatients);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadPatients(true);

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => loadPatients(false), 10000);
    return () => clearInterval(interval);
  }, [loadPatients]);

  // Listen for new PATIENT_ASSIGNED notifications
  useEffect(() => {
    const assignedNotifs = notifications.filter(
      n => n.type === NotificationType.PATIENT_ASSIGNED && !n.isRead
    );
    if (assignedNotifs.length > prevNotifCountRef.current) {
      // New assignment notification arrived
      const newest = assignedNotifs[0];
      if (newest) {
        const toast: ToastMessage = {
          id: newest.id,
          text: newest.message || 'Nouveau patient assigné',
          type: 'info',
        };
        setToasts(prev => [...prev, toast]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, 5000);
      }
      loadPatients(false);
    }
    prevNotifCountRef.current = assignedNotifs.length;
  }, [notifications, loadPatients]);

  // Update tab when URL changes
  useEffect(() => {
    const tabParam = searchParams.get('tab') as FilterTab | null;
    if (tabParam && ['mine', 'waiting', 'all'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleTakePatient = async (patientId: string) => {
    if (!user?.id) return;

    setTakingPatient(patientId);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.transferToDoctor(patientId), {
        doctorId: user.id
      });
      await loadPatients(false);
    } catch (error) {
      console.error('Error taking patient:', error);
    } finally {
      setTakingPatient(null);
    }
  };

  // Get display list for current tab
  const tabPatients = activeTab === 'mine'
    ? myPatients
    : activeTab === 'waiting'
      ? waitingPatients
      : allRelevantPatients;

  // Filter patients based on search and sort
  const filteredPatients = tabPatients
    .filter(p => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return (
        p.fullName.toLowerCase().includes(searchLower) ||
        p.chiefComplaint?.toLowerCase().includes(searchLower) ||
        p.nationalId?.toLowerCase().includes(searchLower)
      );
    })
    // Sort by ESI (ascending) then by time waiting (oldest first)
    .sort((a, b) => {
      const esiA = a.esiLevel || 5;
      const esiB = b.esiLevel || 5;
      if (esiA !== esiB) return esiA - esiB;
      const timeA = a.triageCompletedAt || a.createdAt;
      const timeB = b.triageCompletedAt || b.createdAt;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

  // Waiting time helpers
  const getWaitingMinutes = (patient: PatientListItem): number | null => {
    const ref = patient.triageCompletedAt || patient.treatmentStartedAt;
    if (!ref) return null;
    return Math.floor((now.getTime() - new Date(ref).getTime()) / 60000);
  };

  const formatWaitingTime = (minutes: number | null): string => {
    if (minutes === null) return '-';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
  };

  const getWaitingTimeColor = (minutes: number | null): string => {
    if (minutes === null) return 'text-gray-400';
    if (minutes < 30) return 'text-green-600';
    if (minutes < 60) return 'text-yellow-600 font-medium';
    return 'text-red-600 font-bold';
  };

  // Row background class based on ESI + recently assigned
  const getRowClassName = (patient: PatientListItem): string => {
    const classes: string[] = ['hover:bg-gray-50 transition-colors'];
    if (recentlyAssignedIds.has(patient.id)) {
      classes.push('animate-pulse bg-blue-50');
    } else if (patient.esiLevel === 1) {
      classes.push('bg-red-100');
    } else if (patient.esiLevel === 2) {
      classes.push('bg-orange-50');
    }
    return classes.join(' ');
  };

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

  const tabLabel = activeTab === 'mine'
    ? 'Patients assignés'
    : activeTab === 'waiting'
      ? 'Patients en attente'
      : 'Tous les patients';

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Toast notifications */}
        {toasts.length > 0 && (
          <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map(toast => (
              <div
                key={toast.id}
                className="flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg shadow-lg animate-bounce"
              >
                <Bell className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">{toast.text}</span>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="ml-2 hover:opacity-70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mes Patients</h1>
            <p className="text-gray-600 mt-1">
              Gestion des patients assignés et en attente
            </p>
          </div>
          <div className="flex items-center gap-3">
            {refreshing && (
              <span className="text-xs text-gray-400">Actualisation...</span>
            )}
            <Button onClick={() => loadPatients(false)} variant="outline" disabled={initialLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${initialLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
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
          <Button
            variant={activeTab === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveTab('all')}
          >
            <List className="h-4 w-4 mr-1" />
            Tous ({allRelevantPatients.length})
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
              {tabLabel} ({filteredPatients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {initialLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {activeTab === 'mine'
                    ? 'Aucun patient assigné'
                    : activeTab === 'waiting'
                      ? 'Aucun patient en attente'
                      : 'Aucun patient'}
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
                        Temps d'attente
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
                    {filteredPatients.map((patient) => {
                      const waitMinutes = getWaitingMinutes(patient);
                      return (
                        <tr
                          key={patient.id}
                          className={getRowClassName(patient)}
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
                            <div className="flex items-center gap-1">
                              <Clock className={`h-4 w-4 ${getWaitingTimeColor(waitMinutes)}`} />
                              <span className={`text-sm ${getWaitingTimeColor(waitMinutes)}`}>
                                {formatWaitingTime(waitMinutes)}
                              </span>
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
                            <div className="flex items-center justify-end gap-2">
                              {patient.assignedDoctorId === user?.id && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    navigate(CLIENT_ROUTES.doctor.patientDetail(patient.id))
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Voir
                                </Button>
                              )}
                              {!patient.assignedDoctorId && (
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
                              )}
                            </div>
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
      </div>
    </DashboardLayout>
  );
}
