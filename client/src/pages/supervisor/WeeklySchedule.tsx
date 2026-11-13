import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Save, AlertCircle, Clock } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { getApi } from '../../services/api';
import {
  NurseAssignment,
  NurseShiftPreset,
  NURSE_SHIFT_PRESETS,
  API_ROUTES,
} from '@ncdss/shared';
import { getWeekStart, addWeeks, formatWeekRange, getDayName } from '../../utils/dateUtils';
import { cn } from '../../lib/utils';

interface NurseScheduleDay {
  role: string;
  shiftPreset: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}

interface NurseSchedule {
  nurseId: string;
  nurseName: string;
  days: Record<number, NurseScheduleDay>;
}

const assignmentOptions: { value: string; label: string; variant: 'secondary' | 'success' | 'warning' | 'info' }[] = [
  { value: NurseAssignment.OFF, label: 'Repos', variant: 'secondary' },
  { value: NurseAssignment.INSCRIPTION, label: 'Inscription', variant: 'success' },
  { value: NurseAssignment.TRIAGE, label: 'Triage', variant: 'warning' },
  { value: NurseAssignment.TREATMENT, label: 'Soins', variant: 'info' },
];

function makeDefaultDay(role: string = NurseAssignment.OFF): NurseScheduleDay {
  return { role, shiftPreset: null, shiftStart: null, shiftEnd: null };
}

function getRoleColor(role: string): string {
  switch (role) {
    case NurseAssignment.INSCRIPTION:
      return 'bg-green-50 border-green-200';
    case NurseAssignment.TRIAGE:
      return 'bg-yellow-50 border-yellow-200';
    case NurseAssignment.TREATMENT:
      return 'bg-blue-50 border-blue-200';
    default:
      return 'bg-gray-50 border-gray-100';
  }
}

function getRoleBgClass(role: string): string {
  switch (role) {
    case NurseAssignment.INSCRIPTION:
      return 'bg-green-100';
    case NurseAssignment.TRIAGE:
      return 'bg-yellow-100';
    case NurseAssignment.TREATMENT:
      return 'bg-blue-100';
    default:
      return 'bg-gray-100';
  }
}

function getRoleLabel(role: string): string {
  const opt = assignmentOptions.find((o) => o.value === role);
  return opt?.label || 'Repos';
}

function formatShiftTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  if (m === '00') return `${h}h`;
  return `${h}h${m}`;
}

export default function WeeklySchedulePage(): React.ReactElement {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [schedules, setSchedules] = useState<NurseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ nurseId: string; day: number } | null>(null);
  const [dialogRole, setDialogRole] = useState<string>(NurseAssignment.OFF);
  const [dialogShiftPreset, setDialogShiftPreset] = useState<string | null>(null);
  const [dialogShiftStart, setDialogShiftStart] = useState<string>('08:00');
  const [dialogShiftEnd, setDialogShiftEnd] = useState<string>('20:00');

  const loadSchedule = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.schedule.byWeek(weekStart));
      // Normalize response: ensure every day has the NurseScheduleDay shape
      const normalized: NurseSchedule[] = response.data.map((nurse: NurseSchedule) => {
        const days: Record<number, NurseScheduleDay> = {};
        for (let i = 0; i < 7; i++) {
          const raw = nurse.days[i];
          if (raw && typeof raw === 'object' && 'role' in raw) {
            days[i] = raw;
          } else if (typeof raw === 'string') {
            // Legacy format: plain string role
            days[i] = makeDefaultDay(raw);
          } else {
            days[i] = makeDefaultDay();
          }
        }
        return { ...nurse, days };
      });
      setSchedules(normalized);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handlePrevWeek = (): void => {
    setWeekStart(addWeeks(weekStart, -1));
  };

  const handleNextWeek = (): void => {
    setWeekStart(addWeeks(weekStart, 1));
  };

  const handleCellClick = (nurseId: string, day: number): void => {
    const nurse = schedules.find((s) => s.nurseId === nurseId);
    if (!nurse) return;
    const dayData = nurse.days[day] || makeDefaultDay();

    setEditingCell({ nurseId, day });
    setDialogRole(dayData.role);
    setDialogShiftPreset(dayData.shiftPreset);
    setDialogShiftStart(dayData.shiftStart || '08:00');
    setDialogShiftEnd(dayData.shiftEnd || '20:00');
    setDialogOpen(true);
  };

  const handleDialogConfirm = (): void => {
    if (!editingCell) return;

    const { nurseId, day } = editingCell;
    const isOff = dialogRole === NurseAssignment.OFF;

    const updatedDay: NurseScheduleDay = isOff
      ? makeDefaultDay()
      : {
          role: dialogRole,
          shiftPreset: dialogShiftPreset,
          shiftStart: dialogShiftPreset === NurseShiftPreset.CUSTOM
            ? dialogShiftStart
            : dialogShiftPreset
              ? (NURSE_SHIFT_PRESETS[dialogShiftPreset as NurseShiftPreset]?.startTime ?? null)
              : null,
          shiftEnd: dialogShiftPreset === NurseShiftPreset.CUSTOM
            ? dialogShiftEnd
            : dialogShiftPreset
              ? (NURSE_SHIFT_PRESETS[dialogShiftPreset as NurseShiftPreset]?.endTime ?? null)
              : null,
        };

    setSchedules((prev) =>
      prev.map((s) => {
        if (s.nurseId !== nurseId) return s;
        return { ...s, days: { ...s.days, [day]: updatedDay } };
      })
    );
    setDialogOpen(false);
    setEditingCell(null);
  };

  const handleValidate = async (): Promise<void> => {
    try {
      const api = await getApi();
      const response = await api.post(API_ROUTES.schedule.validate(weekStart), { schedules });

      if (response.data.valid) {
        setValidationErrors([]);
        handleSave();
      } else {
        setValidationErrors(response.data.errors);
        setShowValidation(true);
      }
    } catch {
      setError('Erreur de validation');
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.schedule.save(weekStart), { schedules });
      setError(null);
      setShowValidation(false);
    } catch {
      setError('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const editingNurseName = editingCell
    ? schedules.find((s) => s.nurseId === editingCell.nurseId)?.nurseName || ''
    : '';
  const editingDayName = editingCell !== null ? getDayName(editingCell.day) : '';

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Planning Hebdomadaire</h1>
          <p className="text-gray-600 mt-2">Gérez les affectations et horaires des infirmiers</p>
        </div>

        {/* Week Navigation */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={handlePrevWeek}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Semaine précédente</span>
                <span className="sm:hidden">Préc.</span>
              </Button>

              <div className="text-center">
                <div className="text-base md:text-lg font-semibold">{formatWeekRange(weekStart)}</div>
                <div className="text-xs md:text-sm text-gray-500">Semaine du {weekStart}</div>
              </div>

              <Button variant="outline" size="sm" onClick={handleNextWeek}>
                <span className="hidden sm:inline">Semaine suivante</span>
                <span className="sm:hidden">Suiv.</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {assignmentOptions.map((opt) => (
            <Badge key={opt.value} variant={opt.variant}>
              {opt.label}
            </Badge>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Validation Errors */}
        {showValidation && validationErrors.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">Le planning est incomplet:</div>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowValidation(false)}>
                  Corriger
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Sauvegarder quand même
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Schedule Grid */}
        <Card>
          <CardHeader>
            <CardTitle>{schedules.length} Infirmier(s)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                      Infirmier(ère)
                    </th>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <th
                        key={day}
                        className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {getDayName(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schedules.map((nurse) => (
                    <tr key={nurse.nurseId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{nurse.nurseName}</div>
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                        const dayData = nurse.days[day] || makeDefaultDay();
                        const isOff = dayData.role === NurseAssignment.OFF;

                        return (
                          <td
                            key={day}
                            className={`px-1 py-2 text-center border ${getRoleColor(dayData.role)}`}
                          >
                            <button
                              type="button"
                              onClick={() => handleCellClick(nurse.nurseId, day)}
                              className={cn(
                                'w-full rounded-md px-2 py-2 transition-colors cursor-pointer',
                                'hover:ring-2 hover:ring-blue-300 hover:ring-offset-1',
                                getRoleBgClass(dayData.role)
                              )}
                            >
                              <div className="text-xs font-medium text-gray-800">
                                {getRoleLabel(dayData.role)}
                              </div>
                              {!isOff && dayData.shiftStart && dayData.shiftEnd && (
                                <div className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatShiftTime(dayData.shiftStart)} → {formatShiftTime(dayData.shiftEnd)}
                                </div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <Button onClick={handleValidate} disabled={saving} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer le planning'}
          </Button>
        </div>

        {/* Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier l'affectation</DialogTitle>
              <DialogDescription>
                {editingNurseName} - {editingDayName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Role grid */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Rôle</Label>
                <div className="grid grid-cols-2 gap-2">
                  {assignmentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setDialogRole(opt.value);
                        if (opt.value === NurseAssignment.OFF) {
                          setDialogShiftPreset(null);
                        }
                      }}
                      className={cn(
                        'p-3 rounded-lg border-2 transition-all text-center text-sm font-medium',
                        getRoleBgClass(opt.value),
                        dialogRole === opt.value
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-transparent hover:border-gray-300'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shift preset grid */}
              {dialogRole !== NurseAssignment.OFF && (
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
                            setDialogShiftPreset(key);
                            if (!isCustom) {
                              setDialogShiftStart(config.startTime);
                              setDialogShiftEnd(config.endTime);
                            }
                          }}
                          className={cn(
                            'p-2 rounded-lg border-2 transition-all text-center',
                            dialogShiftPreset === key
                              ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          )}
                        >
                          <div className="text-xs font-medium text-gray-800">
                            {isCustom ? config.labelFr : config.labelFr.split(' (')[0]}
                          </div>
                          {!isCustom && (
                            <div className="text-[11px] sm:text-xs text-gray-500">
                              {formatShiftTime(config.startTime)} → {formatShiftTime(config.endTime)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom time inputs */}
              {dialogRole !== NurseAssignment.OFF &&
                dialogShiftPreset === NurseShiftPreset.CUSTOM && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <Label className="text-xs font-medium text-gray-600">Horaires personnalisés</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-[11px] sm:text-xs text-gray-500">Début</Label>
                        <Input
                          type="time"
                          value={dialogShiftStart}
                          onChange={(e) => setDialogShiftStart(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <span className="text-gray-400 mt-4">→</span>
                      <div className="flex-1">
                        <Label className="text-[11px] sm:text-xs text-gray-500">Fin</Label>
                        <Input
                          type="time"
                          value={dialogShiftEnd}
                          onChange={(e) => setDialogShiftEnd(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleDialogConfirm}>Appliquer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
