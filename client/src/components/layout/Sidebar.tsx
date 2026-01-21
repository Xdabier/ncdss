import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  BedDouble,
  Calendar,
  List,
  FileText,
  Settings,
  LogOut,
  UserCircle,
  BarChart3,
  ClipboardList,
  Search,
  BookOpen,
  Activity,
  Stethoscope,
  Heart,
  HelpCircle,
  Lock,
  Upload,
  Database,
  Shield,
  UserPlus,
  Edit,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole, NurseAssignment } from '@ncdss/shared';
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
    path: '/dashboard',
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
    path: '/admin/users',
    label: 'Gestion Utilisateurs',
    icon: Users,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/er-config',
    label: 'Configuration Urgences',
    icon: Settings,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/boxes',
    label: 'Gestion Boxes',
    icon: BedDouble,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/box-assignments',
    label: 'Affectation Médecins',
    icon: CalendarClock,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/pathologies',
    label: 'Pathologies',
    icon: List,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/interventions',
    label: 'Interventions ABCDE',
    icon: FileText,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/audit',
    label: "Journal d'Audit",
    icon: Shield,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    path: '/admin/backup',
    label: 'Sauvegardes',
    icon: Database,
    roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },

  // Supervisor section
  {
    path: '/supervisor/schedule',
    label: 'Planning Hebdomadaire',
    icon: Calendar,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: '/supervisor/stats',
    label: 'Statistiques',
    icon: BarChart3,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: '/supervisor/queue',
    label: "Gestion File d'Attente",
    icon: ClipboardList,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },
  {
    path: '/supervisor/patients',
    label: 'Tous les Patients',
    icon: Users,
    roles: [UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
  },

  // Nurse - Inscription section
  {
    path: '/nurse/inscription',
    label: 'Inscription',
    icon: UserPlus,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.INSCRIPTION],
  },

  // Nurse - Triage section
  {
    path: '/nurse/triage',
    label: 'File de triage',
    icon: Activity,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.TRIAGE],
  },

  // Nurse - Treatment section
  {
    path: '/nurse/treatment',
    label: 'Soins',
    icon: Heart,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN],
    assignments: [NurseAssignment.TREATMENT],
  },

  // Doctor section
  {
    path: '/doctor/patients',
    label: 'Mes Patients',
    icon: Stethoscope,
    roles: [UserRole.DOCTOR, UserRole.SUPER_ADMIN],
  },

  // Shared/Lookup section
  {
    path: '/patients/search',
    label: 'Recherche Patient',
    icon: Search,
    roles: [
      UserRole.NURSE,
      UserRole.NURSE_SUPERVISOR,
      UserRole.DOCTOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ],
  },
  {
    path: '/lookup/pathologies',
    label: 'Consultation Pathologies',
    icon: BookOpen,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.DOCTOR, UserRole.SUPER_ADMIN],
  },
  {
    path: '/lookup/interventions',
    label: 'Consultation Interventions',
    icon: BookOpen,
    roles: [UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.DOCTOR, UserRole.SUPER_ADMIN],
  },

  // User settings
  {
    path: '/profile',
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
  {
    path: '/settings',
    label: 'Paramètres',
    icon: Settings,
    roles: [
      UserRole.NURSE,
      UserRole.NURSE_SUPERVISOR,
      UserRole.DOCTOR,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ],
  },
  {
    path: '/help',
    label: 'Aide',
    icon: HelpCircle,
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
  const { user, todayAssignment, clearAuth, getRefreshToken } = useAuthStore();

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
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear auth and navigate to login
      await clearAuth();
      navigate('/login', { replace: true });
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

      {/* Logout button */}
      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Déconnexion
        </Button>
      </div>
    </div>
  );
}
