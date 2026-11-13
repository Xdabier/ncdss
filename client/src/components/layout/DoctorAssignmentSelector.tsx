import React, { useState, useEffect } from 'react';
import { Stethoscope, Clock, X, ChevronDown, ChevronRight } from 'lucide-react';
import { BoxType, AssignmentPreset, Box, ASSIGNMENT_PRESETS, API_ROUTES } from '@ncdss/shared';
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
import { useAuthStore, DoctorBoxAssignment } from '../../stores/auth.store';
import { getApi } from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';
import { boxTypeLabels, boxTypeColors, presetLabels } from '../../utils/roleUtils';
import { cn } from '../../lib/utils';

const selectablePresets: AssignmentPreset[] = [
  AssignmentPreset.GARDE_24H,
  AssignmentPreset.JOUR_12H,
  AssignmentPreset.NUIT_12H,
  AssignmentPreset.MATIN_ETE,
  AssignmentPreset.CUSTOM,
];

// Order for displaying box types
const boxTypeOrder: BoxType[] = [
  BoxType.MEDICAL,
  BoxType.SURGICAL,
  BoxType.TRAUMA,
  BoxType.SAUV,
];

interface DoctorAssignmentSelectorProps {
  /** Controlled open state - when provided, component is controlled externally */
  open?: boolean;
  /** Callback when open state changes - used with controlled mode */
  onOpenChange?: (open: boolean) => void;
  /** Callback when assignment is successfully changed */
  onAssignmentChange?: () => void;
  /** Hide the trigger button (use when only the dialog is needed) */
  hideTrigger?: boolean;
}

export function DoctorAssignmentSelector({
  open: controlledOpen,
  onOpenChange,
  onAssignmentChange,
  hideTrigger = false,
}: DoctorAssignmentSelectorProps = {}) {
  const { doctorBoxAssignment, setDoctorBoxAssignment } = useAuthStore();
  const [internalOpen, setInternalOpen] = useState(false);

  // Support both controlled and uncontrolled modes
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    }
    setInternalOpen(value);
  };
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<AssignmentPreset>(AssignmentPreset.JOUR_12H);
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [customEndTime, setCustomEndTime] = useState<string>('20:00');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accordion state - which box types are expanded
  const [expandedTypes, setExpandedTypes] = useState<Set<BoxType>>(new Set([BoxType.MEDICAL]));

  // Fetch available boxes
  useEffect(() => {
    const fetchBoxes = async () => {
      try {
        const api = await getApi();
        const response = await api.get(API_ROUTES.config.boxes);
        // Filter out TRIAGE boxes - doctors are assigned to treatment boxes
        const treatmentBoxes = response.data.filter(
          (box: Box) => box.boxType !== BoxType.TRIAGE && box.isActive
        );
        setBoxes(treatmentBoxes);
      } catch (err) {
        console.error('Error fetching boxes:', err);
      }
    };
    fetchBoxes();
  }, []);

  // Fetch current assignment on mount
  useEffect(() => {
    const fetchCurrentAssignment = async () => {
      try {
        const api = await getApi();
        const response = await api.get(API_ROUTES.boxAssignments.myAssignment);
        if (response.data) {
          await setDoctorBoxAssignment(response.data);
        }
      } catch (err) {
        console.error('Error fetching current assignment:', err);
      }
    };
    fetchCurrentAssignment();
  }, [setDoctorBoxAssignment]);

  // Initialize custom end date/time when opening or changing preset
  useEffect(() => {
    if (selectedPreset === AssignmentPreset.CUSTOM && !customEndDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setCustomEndDate(tomorrow.toISOString().split('T')[0]);
    }
  }, [selectedPreset, customEndDate]);

  const handleOpen = () => {
    setSelectedBoxId(doctorBoxAssignment?.boxId || null);
    setSelectedPreset(AssignmentPreset.JOUR_12H);
    setCustomEndDate('');
    setCustomEndTime('20:00');
    setError(null);

    // Expand the type of current assignment if any
    if (doctorBoxAssignment?.boxType) {
      setExpandedTypes(new Set([doctorBoxAssignment.boxType as BoxType]));
    }

    setIsOpen(true);
  };

  const toggleAccordion = (type: BoxType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const calculateEndDateTime = (): string | undefined => {
    if (selectedPreset === AssignmentPreset.CUSTOM) {
      if (!customEndDate || !customEndTime) return undefined;
      return new Date(`${customEndDate}T${customEndTime}:00`).toISOString();
    }
    return undefined; // Server calculates for presets
  };

  const handleConfirm = async () => {
    if (!selectedBoxId) {
      setError('Veuillez sélectionner un box');
      return;
    }

    if (selectedPreset === AssignmentPreset.CUSTOM && (!customEndDate || !customEndTime)) {
      setError('Veuillez spécifier la date et heure de fin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = await getApi();
      const endDateTime = calculateEndDateTime();

      const response = await api.put(API_ROUTES.boxAssignments.myAssignment, {
        boxId: selectedBoxId,
        presetType: selectedPreset,
        endDateTime,
      });

      await setDoctorBoxAssignment(response.data as DoctorBoxAssignment);
      setIsOpen(false);
      onAssignmentChange?.();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Erreur lors du changement');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndAssignment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.delete(API_ROUTES.boxAssignments.myAssignment);
      await setDoctorBoxAssignment(null);
      setIsOpen(false);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Erreur lors de la terminaison');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatEndTime = (preset: AssignmentPreset): string => {
    if (preset === AssignmentPreset.CUSTOM) {
      if (customEndDate && customEndTime) {
        const end = new Date(`${customEndDate}T${customEndTime}`);
        return end.toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return 'A définir';
    }
    const config = ASSIGNMENT_PRESETS[preset];
    const hours = config.durationHours;
    const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);
    return endTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const currentBoxType = doctorBoxAssignment?.boxType as BoxType | undefined;
  const currentColor = currentBoxType
    ? boxTypeColors[currentBoxType]
    : 'bg-gray-100 text-gray-600';
  const currentLabel = doctorBoxAssignment
    ? `${doctorBoxAssignment.boxName}`
    : 'Non assigné';

  // Group boxes by type
  const boxesByType = boxes.reduce((acc, box) => {
    const type = box.boxType as BoxType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(box);
    return acc;
  }, {} as Record<BoxType, Box[]>);

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
          <Stethoscope className="h-4 w-4" />
          <span className="text-sm font-medium">{currentLabel}</span>
        </button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choisir mon box</DialogTitle>
            <DialogDescription>
              Sélectionnez un box et la durée de votre garde. Début immédiat.
            </DialogDescription>
          </DialogHeader>

          {/* Box Selection with Accordions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Box</Label>
            <div className="border rounded-lg overflow-hidden">
              {boxTypeOrder.map((type) => {
                const typeBoxes = boxesByType[type];
                if (!typeBoxes || typeBoxes.length === 0) return null;

                const isExpanded = expandedTypes.has(type);
                const hasSelection = typeBoxes.some(b => b.id === selectedBoxId);

                return (
                  <div key={type} className="border-b last:border-b-0">
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => toggleAccordion(type)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 text-left transition-colors',
                        'hover:bg-gray-50',
                        hasSelection && 'bg-blue-50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        )}
                        <span className={cn(
                          'font-medium',
                          boxTypeColors[type].replace('bg-', 'text-').replace('-100', '-700')
                        )}>
                          {boxTypeLabels[type]}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({typeBoxes.length} box{typeBoxes.length > 1 ? 's' : ''})
                        </span>
                      </div>
                      {hasSelection && (
                        <span className="text-xs text-blue-600 font-medium">
                          Sélectionné
                        </span>
                      )}
                    </button>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="p-2 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {typeBoxes.map((box) => (
                          <button
                            key={box.id}
                            type="button"
                            onClick={() => setSelectedBoxId(box.id)}
                            className={cn(
                              'p-2 rounded-lg border-2 transition-all text-left text-sm',
                              boxTypeColors[box.boxType as BoxType],
                              selectedBoxId === box.id
                                ? 'border-blue-500 ring-2 ring-blue-200'
                                : 'border-transparent hover:border-gray-300'
                            )}
                          >
                            {box.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preset Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Durée</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectablePresets.map((preset) => {
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSelectedPreset(preset)}
                    className={cn(
                      'p-3 rounded-lg border-2 transition-all text-center',
                      'bg-gray-50 hover:bg-gray-100',
                      selectedPreset === preset
                        ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                        : 'border-transparent'
                    )}
                  >
                    <div className="text-sm font-medium">{presetLabels[preset]}</div>
                    {preset !== AssignmentPreset.CUSTOM && (
                      <div className="text-xs text-gray-500 flex items-center justify-center mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        Fin: {formatEndTime(preset)}
                      </div>
                    )}
                    {preset === AssignmentPreset.CUSTOM && (
                      <div className="text-xs text-gray-500 mt-1">
                        Définir manuellement
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom End Time Selection */}
          {selectedPreset === AssignmentPreset.CUSTOM && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <Label className="text-sm font-medium text-gray-700">Fin de garde</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="endDate" className="text-xs text-gray-500">Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={customEndDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endTime" className="text-xs text-gray-500">Heure</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={customEndTime}
                    onChange={(e) => setCustomEndTime(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {customEndDate && customEndTime && (
                <div className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
                  Fin prévue: {formatEndTime(AssignmentPreset.CUSTOM)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {doctorBoxAssignment && (
              <Button
                variant="destructive"
                onClick={handleEndAssignment}
                disabled={isLoading}
                className="sm:mr-auto"
              >
                <X className="h-4 w-4 mr-1" />
                Terminer
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isLoading || !selectedBoxId || (selectedPreset === AssignmentPreset.CUSTOM && (!customEndDate || !customEndTime))}
            >
              {isLoading ? 'Mise à jour...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
