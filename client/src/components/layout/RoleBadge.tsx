import React from 'react';
import { UserRole, NurseAssignment } from '@ncdss/shared';
import { Badge } from '../ui/badge';
import { roleLabels, assignmentLabels } from '../../utils/roleUtils';

// Map Ionic color names to shadcn badge variants
const roleVariants: Record<UserRole, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  [UserRole.NURSE]: 'default',
  [UserRole.NURSE_SUPERVISOR]: 'secondary',
  [UserRole.DOCTOR]: 'success',
  [UserRole.ADMIN]: 'warning',
  [UserRole.SUPER_ADMIN]: 'destructive',
};

interface Props {
  role: UserRole;
  assignment?: NurseAssignment | null;
}

export function RoleBadge({ role, assignment }: Props) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Badge variant={roleVariants[role]}>{roleLabels[role]}</Badge>

      {role === UserRole.NURSE && assignment && (
        <Badge variant="outline">{assignmentLabels[assignment]}</Badge>
      )}
    </div>
  );
}
