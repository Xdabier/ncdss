import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useAuthStore } from '../stores/auth.store';
import { UserRole, NurseAssignment } from '@ncdss/shared';
import { getApi } from '../services/api';
import { Users, Activity, Clock, UserCheck, AlertTriangle, ArrowRight } from 'lucide-react';

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
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, todayAssignment } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const api = await getApi();
      const response = await api.get('/stats/dashboard');
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const isSupervisor = user?.role === UserRole.NURSE_SUPERVISOR;
  const isNurse = user?.role === UserRole.NURSE;
  const isDoctor = user?.role === UserRole.DOCTOR;

  // Quick action buttons based on role
  const getQuickActions = () => {
    if (isNurse && todayAssignment === NurseAssignment.INSCRIPTION) {
      return [
        { label: 'Nouveau Patient', path: '/nurse/inscription/new', color: 'bg-green-600 hover:bg-green-700' },
        { label: 'Mes Inscriptions', path: '/nurse/inscription', color: 'bg-blue-600 hover:bg-blue-700' },
      ];
    }
    if (isNurse && todayAssignment === NurseAssignment.TRIAGE) {
      return [
        { label: 'File de Triage', path: '/nurse/triage', color: 'bg-yellow-600 hover:bg-yellow-700' },
        { label: `${stats?.today.waitingTriage || 0} en attente`, path: '/nurse/triage', color: 'bg-orange-600 hover:bg-orange-700' },
      ];
    }
    if (isNurse && todayAssignment === NurseAssignment.TREATMENT) {
      return [
        { label: 'Patients en Soins', path: '/nurse/treatment', color: 'bg-purple-600 hover:bg-purple-700' },
        { label: `${stats?.today.inTreatment || 0} patients`, path: '/nurse/treatment', color: 'bg-indigo-600 hover:bg-indigo-700' },
      ];
    }
    if (isDoctor) {
      return [
        { label: 'Mes Patients', path: '/doctor/patients', color: 'bg-blue-600 hover:bg-blue-700' },
        { label: 'Patients en Attente', path: '/doctor/queue', color: 'bg-yellow-600 hover:bg-yellow-700' },
      ];
    }
    if (isAdmin || isSupervisor) {
      return [
        { label: 'Utilisateurs', path: '/admin/users', color: 'bg-blue-600 hover:bg-blue-700' },
        { label: 'Planning', path: '/supervisor/schedule', color: 'bg-green-600 hover:bg-green-700' },
        { label: 'Configuration', path: '/admin/er-config', color: 'bg-gray-600 hover:bg-gray-700' },
      ];
    }
    return [];
  };

  const getRoleLabel = () => {
    if (todayAssignment) {
      const assignments: Record<string, string> = {
        INSCRIPTION: 'Inscription',
        TRIAGE: 'Triage',
        TREATMENT: 'Soins',
        OFF: 'Repos',
      };
      return assignments[todayAssignment] || todayAssignment;
    }
    return null;
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600 mt-2">
            Bienvenue, {user?.fullName}
            {getRoleLabel() && ` - Affectation: ${getRoleLabel()}`}
          </p>
        </div>

        {/* Critical Alert Banner */}
        {stats && stats.today.critical > 0 && (
          <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-6 rounded-r">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-3" />
              <div>
                <p className="text-red-700 font-semibold">
                  {stats.today.critical} patient(s) critique(s)
                </p>
                <p className="text-red-600 text-sm">
                  ESI 1-2 ou NEWS score &ge; 7 - Attention prioritaire requise
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6 rounded-r">
            <p className="text-yellow-700">{error}</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/nurse/inscription')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Patients aujourd'hui
              </CardTitle>
              <Users className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {loading ? '...' : stats?.today.total || 0}
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/nurse/triage')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                En attente de triage
              </CardTitle>
              <Clock className="h-5 w-5 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">
                {loading ? '...' : stats?.today.waitingTriage || 0}
              </div>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/nurse/treatment')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">En soins</CardTitle>
              <Activity className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">
                {loading ? '...' : stats?.today.inTreatment || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Sortis</CardTitle>
              <UserCheck className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {loading ? '...' : stats?.today.discharged || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        {getQuickActions().length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Actions rapides</h2>
            <div className="flex flex-wrap gap-3">
              {getQuickActions().map((action, index) => (
                <button
                  key={index}
                  onClick={() => navigate(action.path)}
                  className={`${action.color} text-white px-6 py-3 rounded-lg font-medium transition-colors`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Patient Flow Visualization */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Flux des patients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-center py-4">
              <div
                className="flex-1 cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors"
                onClick={() => navigate('/nurse/inscription')}
              >
                <div className="text-2xl font-bold text-yellow-600">
                  {loading ? '...' : stats?.today.waitingTriage || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">Inscription</div>
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />

              <div
                className="flex-1 cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors"
                onClick={() => navigate('/nurse/triage')}
              >
                <div className="text-2xl font-bold text-orange-600">
                  {loading ? '...' : stats?.today.inTriage || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">Triage</div>
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />

              <div
                className="flex-1 cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors"
                onClick={() => navigate('/nurse/treatment')}
              >
                <div className="text-2xl font-bold text-blue-600">
                  {loading ? '...' : stats?.today.waitingTreatment || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">Attente soins</div>
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />

              <div
                className="flex-1 cursor-pointer hover:bg-gray-50 rounded-lg p-3 transition-colors"
                onClick={() => navigate('/nurse/treatment')}
              >
                <div className="text-2xl font-bold text-purple-600">
                  {loading ? '...' : stats?.today.inTreatment || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">En soins</div>
              </div>

              <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />

              <div className="flex-1 p-3">
                <div className="text-2xl font-bold text-green-600">
                  {loading ? '...' : stats?.today.discharged || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">Sortis</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Stats (Admin/Supervisor only) */}
        {(isAdmin || isSupervisor) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Temps moyen de triage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-700">
                  {loading ? '...' : `${stats?.performance.avgTriageMinutes || 0} min`}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Personnel actif</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-700">
                  {loading ? '...' : stats?.resources.activeStaff || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Boxes actifs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-700">
                  {loading ? '...' : stats?.resources.activeBoxes || 0}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Welcome Card */}
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue sur NCDSS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Systeme de Support Decisionnel Clinique pour les Infirmiers. Utilisez le menu de
              navigation pour acceder aux differentes fonctionnalites du systeme.
            </p>
            <p className="text-sm text-gray-400 mt-4">
              Actualisation automatique toutes les 30 secondes
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
