import React, { useState } from 'react';
import { UserCog, Clock } from 'lucide-react';
import {
  NurseAssignment,
  NurseShiftPreset,
  NURSE_SHIFT_PRESETS,
  API_ROUTES,
} from '@ncdss/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { useAuthStore, NurseShiftInfo } from '../../stores/auth.store';
import { getApi } from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';
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

function formatShiftTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  if (m === '00') return `${h}h`;
  return `${h}h${m}`;
}

export function AssignmentSelector({
  open: controlledOpen,
  onOpenChange,
  onAssignmentChange,
  hideTrigger = false,
}: AssignmentSelectorProps = {}) {
  const { todayAssignment, nurseShiftInfo, setTodayAssignment } = useAuthStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<NurseAssignment | null>(null);
  const [selectedShiftPreset, setSelectedShiftPreset] = useState<string | null>(null);
  const [customShiftStart, setCustomShiftStart] = useState<string>('08:00');
  const [customShiftEnd, setCustomShiftEnd] = useState<string>('20:00');
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
    setSelectedShiftPreset(nurseShiftInfo?.shiftPreset || null);
    setCustomShiftStart(nurseShiftInfo?.shiftStart || '08:00');
    setCustomShiftEnd(nurseShiftInfo?.shiftEnd || '20:00');
    setError(null);
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedAssignment) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Resolve shift times from preset
      let shiftStart: string | null = null;
      let shiftEnd: string | null = null;
      if (selectedShiftPreset) {
        if (selectedShiftPreset === NurseShiftPreset.CUSTOM) {
          shiftStart = customShiftStart;
          shiftEnd = customShiftEnd;
        } else {
          const config = NURSE_SHIFT_PRESETS[selectedShiftPreset as NurseShiftPreset];
          if (config) {
            shiftStart = config.startTime;
            shiftEnd = config.endTime;
          }
        }
      }

      const api = await getApi();
      await api.put(API_ROUTES.schedule.myAssignment, {
        newAssignment: selectedAssignment,
        shiftPreset: selectedShiftPreset,
        shiftStart,
        shiftEnd,
      });

      const shiftInfo: NurseShiftInfo = {
        shiftPreset: selectedShiftPreset,
        shiftStart,
        shiftEnd,
      };
      await setTodayAssignment(selectedAssignment, shiftInfo);
      setIsOpen(false);
      onAssignmentChange?.();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Erreur lors du changement');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentAssignment = todayAssignment || NurseAssignment.OFF;
  const currentColor = assignmentColors[currentAssignment];
  const currentLabel = assignmentLabels[currentAssignment];
  const hasShiftTimes = nurseShiftInfo?.shiftStart && nurseShiftInfo?.shiftEnd;

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
          <span className="text-sm font-medium text-gray-700">
            {currentLabel}
            {hasShiftTimes && (
              <span className="text-xs text-gray-500 ml-1">
                ({formatShiftTime(nurseShiftInfo!.shiftStart)}{'\u2192'}{formatShiftTime(nurseShiftInfo!.shiftEnd)})
              </span>
            )}
          </span>
        </button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Changer mon assignation</DialogTitle>
            <DialogDescription>
              Sélectionnez votre nouvelle assignation et horaire pour aujourd'hui.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Role grid */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Rôle</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            </div>

            {/* Shift preset grid */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                Horaire
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(NURSE_SHIFT_PRESETS).map(([key, config]) => {
                  const isCustom = key === NurseShiftPreset.CUSTOM;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedShiftPreset(key);
                        if (!isCustom) {
                          setCustomShiftStart(config.startTime);
                          setCustomShiftEnd(config.endTime);
                        }
                      }}
                      className={cn(
                        'p-2 rounded-lg border-2 transition-all text-center',
                        selectedShiftPreset === key
                          ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      )}
                    >
                      <div className="text-xs font-medium text-gray-800">
                        {isCustom ? config.labelFr : config.labelFr.split(' (')[0]}
                      </div>
                      {!isCustom && (
                        <div className="text-[10px] text-gray-500">
                          {formatShiftTime(config.startTime)} → {formatShiftTime(config.endTime)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom time inputs */}
            {selectedShiftPreset === NurseShiftPreset.CUSTOM && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <Label className="text-xs font-medium text-gray-600">Horaires personnalisés</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px] text-gray-500">Début</Label>
                    <Input
                      type="time"
                      value={customShiftStart}
                      onChange={(e) => setCustomShiftStart(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <span className="text-gray-400 mt-4">→</span>
                  <div className="flex-1">
                    <Label className="text-[10px] text-gray-500">Fin</Label>
                    <Input
                      type="time"
                      value={customShiftEnd}
                      onChange={(e) => setCustomShiftEnd(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
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
