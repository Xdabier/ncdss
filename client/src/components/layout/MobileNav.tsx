import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, Calendar, Settings } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole } from '@ncdss/shared';
import { cn } from '../../lib/utils';

interface NavButtonProps {
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function NavButton({ icon, activeIcon, label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center flex-1 py-2 px-1 transition-colors',
        isActive
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <div className="mb-1">
        {isActive ? activeIcon : icon}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  if (!user) return null;

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  const isSupervisor = user.role === UserRole.NURSE_SUPERVISOR;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border flex items-center h-16 z-50">
      <NavButton
        icon={<Home className="h-5 w-5" strokeWidth={1.5} />}
        activeIcon={<Home className="h-5 w-5" strokeWidth={2.5} />}
        label="Accueil"
        isActive={location.pathname === '/dashboard'}
        onClick={() => navigate('/dashboard')}
      />

      {isAdmin && (
        <NavButton
          icon={<Users className="h-5 w-5" strokeWidth={1.5} />}
          activeIcon={<Users className="h-5 w-5" strokeWidth={2.5} />}
          label="Utilisateurs"
          isActive={location.pathname.startsWith('/admin/users')}
          onClick={() => navigate('/admin/users')}
        />
      )}

      {isSupervisor && (
        <NavButton
          icon={<Calendar className="h-5 w-5" strokeWidth={1.5} />}
          activeIcon={<Calendar className="h-5 w-5" strokeWidth={2.5} />}
          label="Planning"
          isActive={location.pathname === '/supervisor/schedule'}
          onClick={() => navigate('/supervisor/schedule')}
        />
      )}

      {isAdmin && (
        <NavButton
          icon={<Settings className="h-5 w-5" strokeWidth={1.5} />}
          activeIcon={<Settings className="h-5 w-5" strokeWidth={2.5} />}
          label="Config"
          isActive={location.pathname === '/admin/er-config'}
          onClick={() => navigate('/admin/er-config')}
        />
      )}
    </nav>
  );
}
