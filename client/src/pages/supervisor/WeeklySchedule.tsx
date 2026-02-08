import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, AlertCircle, Clock } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { getApi } from '../../services/api';
import {
  NurseAssignment,
  NurseShiftPreset,
  NURSE_SHIFT_PRESETS,
  API_ROUTES,
} from '@ncdss/shared';
import { getWeekStart, addWeeks, formatWeekRange, getDayName } from '../../utils/dateUtils';

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

const shiftPresetOptions = Object.entries(NURSE_SHIFT_PRESETS).map(([key, config]) => ({
  value: key,
  label: config.labelFr,
}));

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

export default function WeeklySchedulePage(): React.ReactElement {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [schedules, setSchedules] = useState<NurseSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    loadSchedule();
  }, [weekStart]);

  const loadSchedule = async (): Promise<void> => {
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
  };

  const handlePrevWeek = (): void => {
    setWeekStart(addWeeks(weekStart, -1));
  };

  const handleNextWeek = (): void => {
    setWeekStart(addWeeks(weekStart, 1));
  };

  const handleRoleChange = (nurseId: string, day: number, newRole: string): void => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.nurseId !== nurseId) return s;
        const currentDay = s.days[day] || makeDefaultDay();
        const updatedDay: NurseScheduleDay =
          newRole === NurseAssignment.OFF
            ? makeDefaultDay()
            : { ...currentDay, role: newRole };
        return { ...s, days: { ...s.days, [day]: updatedDay } };
      })
    );
  };

  const handleShiftPresetChange = (nurseId: string, day: number, preset: string): void => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.nurseId !== nurseId) return s;
        const currentDay = s.days[day] || makeDefaultDay();
        const config = NURSE_SHIFT_PRESETS[preset as NurseShiftPreset];
        const updatedDay: NurseScheduleDay =
          preset === NurseShiftPreset.CUSTOM
            ? {
                ...currentDay,
                shiftPreset: preset,
                shiftStart: currentDay.shiftStart || '08:00',
                shiftEnd: currentDay.shiftEnd || '20:00',
              }
            : {
                ...currentDay,
                shiftPreset: preset,
                shiftStart: config?.startTime ?? null,
                shiftEnd: config?.endTime ?? null,
              };
        return { ...s, days: { ...s.days, [day]: updatedDay } };
      })
    );
  };

  const handleCustomTimeChange = (
    nurseId: string,
    day: number,
    field: 'shiftStart' | 'shiftEnd',
    value: string
  ): void => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.nurseId !== nurseId) return s;
        const currentDay = s.days[day] || makeDefaultDay();
        return { ...s, days: { ...s.days, [day]: { ...currentDay, [field]: value } } };
      })
    );
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
              <table className="w-full min-w-[1000px]">
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
                        const isCustom = dayData.shiftPreset === NurseShiftPreset.CUSTOM;

                        return (
                          <td
                            key={day}
                            className={`px-1 py-2 text-center border ${getRoleColor(dayData.role)}`}
                          >
                            <div className="flex flex-col items-center gap-1.5 w-36 mx-auto">
                              {/* Role Dropdown */}
                              <Select
                                value={dayData.role}
                                onValueChange={(value) =>
                                  handleRoleChange(nurse.nurseId, day, value)
                                }
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {assignmentOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {/* Shift Preset Dropdown — only when not OFF */}
                              {!isOff && (
                                <Select
                                  value={dayData.shiftPreset || ''}
                                  onValueChange={(value) =>
                                    handleShiftPresetChange(nurse.nurseId, day, value)
                                  }
                                >
                                  <SelectTrigger className="w-full h-7 text-[11px]">
                                    <div className="flex items-center gap-1 truncate">
                                      <Clock className="h-3 w-3 shrink-0 text-gray-400" />
                                      <SelectValue placeholder="Horaire..." />
                                    </div>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {shiftPresetOptions.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              {/* Custom time inputs */}
                              {!isOff && isCustom && (
                                <div className="flex items-center gap-1 w-full">
                                  <Input
                                    type="time"
                                    value={dayData.shiftStart || '08:00'}
                                    onChange={(e) =>
                                      handleCustomTimeChange(
                                        nurse.nurseId,
                                        day,
                                        'shiftStart',
                                        e.target.value
                                      )
                                    }
                                    className="h-6 text-[10px] px-1 w-1/2"
                                  />
                                  <span className="text-[10px] text-gray-400">→</span>
                                  <Input
                                    type="time"
                                    value={dayData.shiftEnd || '20:00'}
                                    onChange={(e) =>
                                      handleCustomTimeChange(
                                        nurse.nurseId,
                                        day,
                                        'shiftEnd',
                                        e.target.value
                                      )
                                    }
                                    className="h-6 text-[10px] px-1 w-1/2"
                                  />
                                </div>
                              )}
                            </div>
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
      </div>
    </DashboardLayout>
  );
}
