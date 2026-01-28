import React, { useState } from 'react';
import { UserCog } from 'lucide-react';
import { NurseAssignment } from '@ncdss/shared';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { useAuthStore } from '../../stores/auth.store';
import { getApi } from '../../services/api';
import { assignmentLabels, assignmentColors } from '../../utils/roleUtils';
import { cn } from '../../lib/utils';

const selectableAssignments = [
  NurseAssignment.INSCRIPTION,
  NurseAssignment.TRIAGE,
  NurseAssignment.TREATMENT,
];

interface AssignmentSelectorProps {
  /** Controlled open state - when provided, component is controlled externally */
  open?: boolean;
  /** Callback when open state changes - used with controlled mode */
  onOpenChange?: (open: boolean) => void;
  /** Callback when assignment is successfully changed */
  onAssignmentChange?: () => void;
  /** Hide the trigger button (use when only the dialog is needed) */
  hideTrigger?: boolean;
}

export function AssignmentSelector({
  open: controlledOpen,
  onOpenChange,
  onAssignmentChange,
  hideTrigger = false,
}: AssignmentSelectorProps = {}) {
  const { todayAssignment, setTodayAssignment } = useAuthStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<NurseAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Support both controlled and uncontrolled modes
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    }
    setInternalOpen(value);
  };

  const handleOpen = () => {
    setSelectedAssignment(todayAssignment);
    setError(null);
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedAssignment || selectedAssignment === todayAssignment) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.put('/schedule/my-assignment', {
        newAssignment: selectedAssignment,
      });

      await setTodayAssignment(selectedAssignment);
      setIsOpen(false);
      onAssignmentChange?.();
    } catch (err: any) {
      const message = err.response?.data?.error || 'Erreur lors du changement';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentAssignment = todayAssignment || NurseAssignment.OFF;
  const currentColor = assignmentColors[currentAssignment];
  const currentLabel = assignmentLabels[currentAssignment];

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={handleOpen}
          className={cn(
            'flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors',
            'hover:opacity-80 cursor-pointer',
            currentColor
          )}
        >
          <UserCog className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">{currentLabel}</span>
        </button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer mon assignation</DialogTitle>
            <DialogDescription>
              Sélectionnez votre nouvelle assignation pour aujourd'hui.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3 py-4">
            {selectableAssignments.map((assignment) => (
              <button
                key={assignment}
                onClick={() => setSelectedAssignment(assignment)}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all text-center',
                  assignmentColors[assignment],
                  selectedAssignment === assignment
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-transparent hover:border-gray-300'
                )}
              >
                <span className="text-sm font-medium">{assignmentLabels[assignment]}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? 'Mise à jour...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
