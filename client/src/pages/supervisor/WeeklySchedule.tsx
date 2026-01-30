import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { getApi } from '../../services/api';
import { NurseAssignment, API_ROUTES } from '@ncdss/shared';
import { getWeekStart, addWeeks, formatWeekRange, getDayName } from '../../utils/dateUtils';

interface NurseSchedule {
  nurseId: string;
  nurseName: string;
  days: Record<number, string>;
}

const assignmentOptions = [
  { value: NurseAssignment.OFF, label: '—', variant: 'secondary' as const },
  { value: NurseAssignment.INSCRIPTION, label: 'INS', variant: 'success' as const },
  { value: NurseAssignment.TRIAGE, label: 'TRI', variant: 'warning' as const },
  { value: NurseAssignment.TREATMENT, label: 'SOI', variant: 'info' as const },
];

const assignmentLabels: Record<string, string> = {
  [NurseAssignment.OFF]: 'Repos',
  [NurseAssignment.INSCRIPTION]: 'Inscription',
  [NurseAssignment.TRIAGE]: 'Triage',
  [NurseAssignment.TREATMENT]: 'Soins',
};

export default function WeeklySchedulePage() {
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

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.schedule.byWeek(weekStart));
      setSchedules(response.data);
    } catch (e) {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    setWeekStart(addWeeks(weekStart, -1));
  };

  const handleNextWeek = () => {
    setWeekStart(addWeeks(weekStart, 1));
  };

  const handleAssignmentChange = (nurseId: string, day: number, value: string) => {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.nurseId === nurseId) {
          return { ...s, days: { ...s.days, [day]: value } };
        }
        return s;
      })
    );
  };

  const handleValidate = async () => {
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
    } catch (e) {
      setError('Erreur de validation');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.schedule.save(weekStart), { schedules });
      setError(null);
      setShowValidation(false);
    } catch (e) {
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
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Planning Hebdomadaire</h1>
          <p className="text-gray-600 mt-2">Gérez les affectations des infirmiers par jour</p>
        </div>

        {/* Week Navigation */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={handlePrevWeek}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Semaine précédente
              </Button>

              <div className="text-center">
                <div className="text-lg font-semibold">{formatWeekRange(weekStart)}</div>
                <div className="text-sm text-gray-500">Semaine du {weekStart}</div>
              </div>

              <Button variant="outline" onClick={handleNextWeek}>
                Semaine suivante
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {assignmentOptions.map((opt) => (
            <Badge key={opt.value} variant={opt.variant}>
              {opt.label} = {assignmentLabels[opt.value]}
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
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">
                      Infirmier(ère)
                    </th>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <th
                        key={day}
                        className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {getDayName(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {schedules.map((nurse) => (
                    <tr key={nurse.nurseId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{nurse.nurseName}</div>
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                        <td key={day} className="px-4 py-4 text-center">
                          <Select
                            value={nurse.days[day] || NurseAssignment.OFF}
                            onValueChange={(value) =>
                              handleAssignmentChange(nurse.nurseId, day, value)
                            }
                          >
                            <SelectTrigger className="w-24">
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
                        </td>
                      ))}
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
