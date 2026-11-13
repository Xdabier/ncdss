import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  BedDouble,
  Calendar,
  Settings,
  LogOut,
  UserCircle,
  BarChart3,
  ClipboardList,
  Activity,
  Stethoscope,
  Heart,
  Lock,
  Database,
  Shield,
  UserPlus,
  CalendarClock,
  Monitor,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useNotificationStore } from '../../stores/notification.store';
import { UserRole, NurseAssignment, API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

interface Props {
  onClose?: () => void;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  assignments?: NurseAssignment[];
}

const navItems: NavItem[] = [
  // General
  {
    path: CLIENT_ROUTES.dashboard,
    label: 'Tableau de bord',
    icon: Home,
    roles: [
      UserRole.NURSE,
      UserRole.NURSE_SUPERVISOR,
      UserRole.DOCTOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ],
  },

  // Admin section
  {
    path: CLIENT_ROUTES.admin.users,
    label: 'Gestion Utilisateurs',
    icon: Users,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.admin.erConfig,
    label: 'Configuration Urgences',
    icon: Settings,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.admin.boxes,
    label: 'Gestion Boxes',
    icon: BedDouble,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.admin.boxAssignments,
    label: 'Affectation Médecins',
    icon: CalendarClock,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.admin.clinicalData,
    label: 'Données Cliniques',
    icon: Database,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.admin.audit,
    label: "Journal d'Audit",
    icon: Shield,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },

  // Supervisor section
  {
    path: CLIENT_ROUTES.supervisor.schedule,
    label: 'Planning Hebdomadaire',
    icon: Calendar,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.supervisor.stats,
    label: 'Statistiques',
    icon: BarChart3,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.supervisor.queue,
    label: "Gestion File d'Attente",
    icon: ClipboardList,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: CLIENT_ROUTES.supervisor.patients,
    label: 'Tous les Patients',
    icon: Users,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },

  // Nurse - Inscription section
  {
    path: CLIENT_ROUTES.nurse.inscription.home,
    label: 'Inscription',
    icon: UserPlus,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.INSCRIPTION],
  },

  // Nurse - Triage section
  {
    path: CLIENT_ROUTES.nurse.triage.queue,
    label: 'File de triage',
    icon: Activity,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.TRIAGE],
  },

  // Nurse - Treatment section
  {
    path: CLIENT_ROUTES.nurse.treatment.queue,
    label: 'Soins',
    icon: Heart,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.TREATMENT],
  },

  // Doctor section
  {
    path: CLIENT_ROUTES.doctor.patients,
    label: 'Mes Patients',
    icon: Stethoscope,
    roles: [UserRole.DOCTOR, UserRole.SUPER_ADMIN],
  },

  // Tracking board
  {
    path: CLIENT_ROUTES.shared.trackingBoard,
    label: 'Tableau de Suivi',
    icon: Monitor,
    roles: [
      UserRole.NURSE,
      UserRole.NURSE_SUPERVISOR,
      UserRole.DOCTOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ],
  },

  // User settings
  {
    path: CLIENT_ROUTES.profile,
    label: 'Mon Profil',
    icon: UserCircle,
    roles: [
      UserRole.NURSE,
      UserRole.NURSE_SUPERVISOR,
      UserRole.DOCTOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ],
  },
];

const roleLabels: Record<UserRole, string> = {
  [UserRole.NURSE]: 'Infirmier(ère)',
  [UserRole.NURSE_SUPERVISOR]: 'Surveillant(e)',
  [UserRole.DOCTOR]: 'Médecin',
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.SUPER_ADMIN]: 'Super Admin',
};

export function Sidebar({ onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, todayAssignment, clearAuth, getRefreshToken, setLocked } = useAuthStore();
  const { clearNotifications } = useNotificationStore();

  if (!user) return null;

  const filteredItems = navItems.filter((item) => {
    if (!item.roles.includes(user.role as UserRole)) return false;
    if (item.assignments && user.role === UserRole.NURSE) {
      if (!todayAssignment || !item.assignments.includes(todayAssignment)) {
        return false;
      }
    }
    return true;
  });

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleLogout = async () => {
    try {
      // Get the API and refresh token
      const { getApi } = await import('../../services/api');
      const api = await getApi();
      const refreshToken = await getRefreshToken();

      // Call logout endpoint to revoke refresh token
      if (refreshToken) {
        await api.post(API_ROUTES.auth.logout, { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear auth, stop notifications, and navigate to login
      clearNotifications();
      await clearAuth();
      navigate(CLIENT_ROUTES.login, { replace: true });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* User info */}
      <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
            <UserCircle className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="font-semibold text-white">{user.fullName}</div>
            <Badge variant="secondary" className="mt-1 text-xs">
              {roleLabels[user.role as UserRole]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            return (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  'w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive ? 'text-blue-600' : 'text-gray-500')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Lock & Logout buttons */}
      <div className="p-4 border-t flex gap-2">
        {user?.hasPin && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-gray-600 hover:text-gray-800"
            onClick={() => {
              setLocked(true);
              navigate(CLIENT_ROUTES.lock, { replace: true });
            }}
          >
            <Lock className="h-4 w-4 mr-2" />
            Verrouiller
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={`${user?.hasPin ? 'flex-1' : 'w-full'} text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200`}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Déconnexion
        </Button>
      </div>
    </div>
  );
}
