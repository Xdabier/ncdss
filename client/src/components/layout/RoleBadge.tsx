import React from 'react';
import { IonBadge } from '@ionic/react';
import { UserRole, NurseAssignment } from '@ncdss/shared';
import { roleLabels, roleColors, assignmentLabels } from '../../utils/roleUtils';

interface Props {
  role: UserRole;
  assignment?: NurseAssignment | null;
}

export function RoleBadge({ role, assignment }: Props) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <IonBadge color={roleColors[role]}>{roleLabels[role]}</IonBadge>

      {role === UserRole.NURSE && assignment && (
        <IonBadge color="light">{assignmentLabels[assignment]}</IonBadge>
      )}
    </div>
  );
}
