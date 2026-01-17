import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/react';
import {
  homeOutline,
  home,
  peopleOutline,
  people,
  settingsOutline,
  settings,
  calendarOutline,
  calendar,
} from 'ionicons/icons';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole } from '@ncdss/shared';

export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();

  if (!user) return null;

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  const isSupervisor = user.role === UserRole.NURSE_SUPERVISOR;

  return (
    <IonTabBar slot="bottom" className="border-t">
      <IonTabButton
        tab="home"
        onClick={() => navigate('/dashboard')}
        selected={location.pathname === '/dashboard'}
      >
        <IonIcon icon={location.pathname === '/dashboard' ? home : homeOutline} />
        <IonLabel>Accueil</IonLabel>
      </IonTabButton>

      {isAdmin && (
        <IonTabButton
          tab="users"
          onClick={() => navigate('/admin/users')}
          selected={location.pathname.startsWith('/admin/users')}
        >
          <IonIcon icon={location.pathname.startsWith('/admin/users') ? people : peopleOutline} />
          <IonLabel>Utilisateurs</IonLabel>
        </IonTabButton>
      )}

      {isSupervisor && (
        <IonTabButton
          tab="schedule"
          onClick={() => navigate('/supervisor/schedule')}
          selected={location.pathname === '/supervisor/schedule'}
        >
          <IonIcon
            icon={location.pathname === '/supervisor/schedule' ? calendar : calendarOutline}
          />
          <IonLabel>Planning</IonLabel>
        </IonTabButton>
      )}

      {isAdmin && (
        <IonTabButton
          tab="settings"
          onClick={() => navigate('/admin/er-config')}
          selected={location.pathname === '/admin/er-config'}
        >
          <IonIcon icon={location.pathname === '/admin/er-config' ? settings : settingsOutline} />
          <IonLabel>Config</IonLabel>
        </IonTabButton>
      )}
    </IonTabBar>
  );
}
