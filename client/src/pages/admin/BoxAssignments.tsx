import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Clock, Calendar, Filter } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
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
import { Box, User, AssignmentPreset, ASSIGNMENT_PRESETS } from '@ncdss/shared';
import { cn } from '../../lib/utils';

interface BoxAssignmentWithDetails {
  id: string;
  boxId: string;
  boxName: string;
  boxType: string;
  doctorId: string;
  doctorName: string;
  startDateTime: string;
  endDateTime: string;
  presetType: AssignmentPreset | null;
  isActive: boolean;
}

type FilterMode = 'all' | 'current' | 'date';

const presetColors: Record<AssignmentPreset, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  GARDE_24H: 'destructive',
  JOUR_12H: 'default',
  NUIT_12H: 'secondary',
  MATIN_ETE: 'outline',
  CUSTOM: 'outline',
};

export default function BoxAssignments() {
  const [assignments, setAssignments] = useState<BoxAssignmentWithDetails[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteAssignment, setDeleteAssignment] = useState<BoxAssignmentWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>('current');
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Form state
  const [selectedBox, setSelectedBox] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<AssignmentPreset>(AssignmentPreset.GARDE_24H);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endDate, setEndDate] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('08:00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [filterMode, filterDate]);

  useEffect(() => {
    // Update end date/time when preset or start date changes
    if (selectedPreset !== AssignmentPreset.CUSTOM) {
      const preset = ASSIGNMENT_PRESETS[selectedPreset];
      setStartTime(preset.startTime);
      setEndTime(preset.endTime);

      if (startDate) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + preset.spansDays);
        setEndDate(start.toISOString().split('T')[0]);
      }
    }
  }, [selectedPreset, startDate]);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      const api = await getApi();

      let assignmentsUrl = '/box-assignments';
      if (filterMode === 'current') {
        assignmentsUrl += '?current=true';
      } else if (filterMode === 'date' && filterDate) {
        assignmentsUrl += `?date=${filterDate}`;
      }

      const [assignmentsRes, boxesRes, doctorsRes] = await Promise.all([
        api.get(assignmentsUrl),
        api.get('/config/boxes'),
        api.get('/users/by-role/DOCTOR')
      ]);

      setAssignments(assignmentsRes.data);
      setBoxes(boxesRes.data.filter((b: Box) => b.isActive && b.boxType !== 'TRIAGE'));
      setDoctors(doctorsRes.data);
    } catch (e) {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (!selectedBox || !selectedDoctor || !startDate || !startTime || !endDate || !endTime) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const startDateTime = `${startDate}T${startTime}:00`;
      const endDateTime = `${endDate}T${endTime}:00`;

      const api = await getApi();
      await api.post('/box-assignments', {
        boxId: selectedBox,
        doctorId: selectedDoctor,
        startDateTime,
        endDateTime,
        presetType: selectedPreset,
      });

      setShowModal(false);
      resetForm();
      loadData();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur de création');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteAssignment) return;

    try {
      const api = await getApi();
      await api.delete(`/box-assignments/${deleteAssignment.id}`);
      setDeleteAssignment(null);
      loadData();
    } catch (e) {
      setError('Erreur de suppression');
    }
  };

  const resetForm = (): void => {
    setSelectedBox('');
    setSelectedDoctor('');
    setSelectedPreset(AssignmentPreset.GARDE_24H);
    setStartDate(new Date().toISOString().split('T')[0]);
    setStartTime('08:00');
    setEndDate('');
    setEndTime('08:00');
    setError(null);
  };

  const formatDateTime = (isoString: string): string => {
    const d = new Date(isoString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
  };

  const formatTimeRange = (start: string, end: string): string => {
    const s = new Date(start);
    const e = new Date(end);

    const formatDate = (d: Date) =>
      `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    const formatTime = (d: Date) =>
      `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    if (s.toDateString() === e.toDateString()) {
      return `${formatDate(s)} ${formatTime(s)} - ${formatTime(e)}`;
    } else {
      return `${formatDate(s)} ${formatTime(s)} → ${formatDate(e)} ${formatTime(e)}`;
    }
  };

  const isCurrentlyActive = (start: string, end: string): boolean => {
    const now = new Date();
    return new Date(start) <= now && now < new Date(end);
  };

  const columns: Column<BoxAssignmentWithDetails>[] = [
    { key: 'boxName', header: 'Box', width: '20%' },
    { key: 'doctorName', header: 'Médecin', width: '20%' },
    {
      key: 'timeRange',
      header: 'Période',
      width: '25%',
      render: (a) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className={cn(
            isCurrentlyActive(a.startDateTime, a.endDateTime) && 'text-green-600 font-medium'
          )}>
            {formatTimeRange(a.startDateTime, a.endDateTime)}
          </span>
        </div>
      )
    },
    {
      key: 'presetType',
      header: 'Type',
      width: '15%',
      render: (a) => (
        <Badge variant={a.presetType ? presetColors[a.presetType] : 'outline'}>
          {a.presetType ? ASSIGNMENT_PRESETS[a.presetType].label : 'Custom'}
        </Badge>
      )
    },
    {
      key: 'status',
      header: 'Statut',
      width: '10%',
      render: (a) => (
        isCurrentlyActive(a.startDateTime, a.endDateTime) ? (
          <Badge variant="default" className="bg-green-600">En cours</Badge>
        ) : new Date(a.startDateTime) > new Date() ? (
          <Badge variant="outline">À venir</Badge>
        ) : (
          <Badge variant="secondary">Terminé</Badge>
        )
      )
    },
    {
      key: 'actions',
      header: '',
      width: '10%',
      render: (a) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteAssignment(a);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )
    }
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Affectation des Médecins</h1>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Afficher:</span>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={filterMode === 'current' ? 'default' : 'outline'}
              onClick={() => setFilterMode('current')}
            >
              En cours maintenant
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'date' ? 'default' : 'outline'}
              onClick={() => setFilterMode('date')}
            >
              Par date
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterMode('all')}
            >
              Tous
            </Button>
          </div>

          {filterMode === 'date' && (
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-auto"
            />
          )}

          <div className="flex-1" />

          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle Affectation
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Assignments Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={assignments}
            loading={loading}
            keyExtractor={(a) => a.id}
            emptyMessage={
              filterMode === 'current'
                ? "Aucun médecin n'est actuellement de garde. Cliquez sur 'Nouvelle Affectation' pour planifier."
                : "Aucune affectation trouvée pour les critères sélectionnés."
            }
          />
        </div>

        {/* Create Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowModal(false);
                resetForm();
              }}
            />

            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">Nouvelle Affectation</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Error in modal */}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Box Selection */}
                <div>
                  <Label htmlFor="box">Box *</Label>
                  <Select value={selectedBox} onValueChange={setSelectedBox}>
                    <SelectTrigger id="box" className="mt-1">
                      <SelectValue placeholder="Sélectionner un box" />
                    </SelectTrigger>
                    <SelectContent>
                      {boxes.map(box => (
                        <SelectItem key={box.id} value={box.id}>
                          {box.name} ({box.boxType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Doctor Selection */}
                <div>
                  <Label htmlFor="doctor">Médecin *</Label>
                  <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                    <SelectTrigger id="doctor" className="mt-1">
                      <SelectValue placeholder="Sélectionner un médecin" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map(doc => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preset Selection */}
                <div>
                  <Label className="mb-2 block">Type de garde</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(ASSIGNMENT_PRESETS).map(([key, config]) => (
                      <Button
                        key={key}
                        type="button"
                        variant={selectedPreset === key ? 'default' : 'outline'}
                        className={cn(
                          'justify-start h-auto py-2 px-3',
                          selectedPreset === key && key === 'GARDE_24H' && 'bg-red-600 hover:bg-red-700',
                          selectedPreset === key && key === 'NUIT_12H' && 'bg-indigo-600 hover:bg-indigo-700'
                        )}
                        onClick={() => setSelectedPreset(key as AssignmentPreset)}
                      >
                        <div className="text-left">
                          <div className="font-medium">{config.label}</div>
                          <div className="text-xs opacity-75">
                            {config.startTime} → {config.endTime}
                            {config.spansDays > 0 && ' (+1j)'}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Date/Time Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Date de début *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="startTime">Heure de début</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        if (selectedPreset !== AssignmentPreset.CUSTOM) {
                          setSelectedPreset(AssignmentPreset.CUSTOM);
                        }
                      }}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endDate">Date de fin *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        if (selectedPreset !== AssignmentPreset.CUSTOM) {
                          setSelectedPreset(AssignmentPreset.CUSTOM);
                        }
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">Heure de fin</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        if (selectedPreset !== AssignmentPreset.CUSTOM) {
                          setSelectedPreset(AssignmentPreset.CUSTOM);
                        }
                      }}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Duration Preview */}
                {startDate && startTime && endDate && endTime && (
                  <div className="p-3 bg-blue-50 rounded-lg text-sm">
                    <div className="font-medium text-blue-900">Résumé:</div>
                    <div className="text-blue-700 mt-1">
                      Du {new Date(`${startDate}T${startTime}`).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })} à {startTime}
                      <br />
                      Au {new Date(`${endDate}T${endTime}`).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })} à {endTime}
                    </div>
                    <div className="text-blue-600 mt-1 font-medium">
                      Durée: {calculateDuration(startDate, startTime, endDate, endTime)}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full mt-6"
                  onClick={handleCreate}
                  disabled={!selectedBox || !selectedDoctor || !startDate || !endDate || saving}
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={!!deleteAssignment}
          title="Supprimer l'affectation"
          message={`Êtes-vous sûr de vouloir supprimer l'affectation de ${deleteAssignment?.doctorName} au ${deleteAssignment?.boxName} (${deleteAssignment ? formatTimeRange(deleteAssignment.startDateTime, deleteAssignment.endDateTime) : ''}) ?`}
          confirmText="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setDeleteAssignment(null)}
        />
      </div>
    </DashboardLayout>
  );
}

function calculateDuration(startDate: string, startTime: string, endDate: string, endTime: string): string {
  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs <= 0) return 'Invalide';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) {
      return `${days} jour${days > 1 ? 's' : ''}`;
    }
    return `${days}j ${remainingHours}h`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}min`;
}
