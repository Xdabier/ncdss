import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { getApi } from '../../services/api';
import { Box, BoxAssignment, Shift, User } from '@ncdss/shared';
import { cn } from '../../lib/utils';

interface BoxAssignmentWithDetails extends BoxAssignment {
  boxName: string;
  boxType: string;
  doctorName: string;
}

const shiftLabels: Record<string, string> = {
  MORNING: 'Matin (6h-14h)',
  AFTERNOON: 'Après-midi (14h-22h)',
  NIGHT: 'Nuit (22h-6h)'
};

const shiftColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  MORNING: 'outline',
  AFTERNOON: 'default',
  NIGHT: 'secondary'
};

export default function BoxAssignments() {
  const [assignments, setAssignments] = useState<BoxAssignmentWithDetails[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteAssignment, setDeleteAssignment] = useState<BoxAssignmentWithDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedBox, setSelectedBox] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (): Promise<void> => {
    try {
      const api = await getApi();
      const [assignmentsRes, boxesRes, doctorsRes] = await Promise.all([
        api.get('/box-assignments'),
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
    if (!selectedBox || !selectedDoctor || !selectedShift) return;

    setSaving(true);
    try {
      const api = await getApi();
      await api.post('/box-assignments', {
        boxId: selectedBox,
        doctorId: selectedDoctor,
        shift: selectedShift,
        effectiveDate: new Date().toISOString().split('T')[0]
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
    setSelectedShift('');
  };

  const columns: Column<BoxAssignmentWithDetails>[] = [
    { key: 'boxName', header: 'Box', width: '25%' },
    { key: 'doctorName', header: 'Médecin', width: '30%' },
    {
      key: 'shift',
      header: 'Équipe',
      width: '25%',
      render: (a) => (
        <Badge variant={shiftColors[a.shift]}>
          {shiftLabels[a.shift]}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '20%',
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

        {/* Add Button */}
        <div className="flex justify-end mb-4">
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
            emptyMessage="Aucune affectation. Cliquez sur 'Nouvelle Affectation' pour commencer."
          />
        </div>

        {/* Create Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowModal(false)}
            />

            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 z-10">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">Nouvelle Affectation</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <Label htmlFor="box">Box *</Label>
                  <Select value={selectedBox} onValueChange={setSelectedBox}>
                    <SelectTrigger id="box" className="mt-1">
                      <SelectValue placeholder="Sélectionner un box" />
                    </SelectTrigger>
                    <SelectContent>
                      {boxes.map(box => (
                        <SelectItem key={box.id} value={box.id}>
                          {box.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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

                <div>
                  <Label htmlFor="shift">Équipe *</Label>
                  <Select value={selectedShift} onValueChange={setSelectedShift}>
                    <SelectTrigger id="shift" className="mt-1">
                      <SelectValue placeholder="Sélectionner une équipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(shiftLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full mt-6"
                  onClick={handleCreate}
                  disabled={!selectedBox || !selectedDoctor || !selectedShift || saving}
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
          message={`Êtes-vous sûr de vouloir supprimer l'affectation de ${deleteAssignment?.doctorName} au ${deleteAssignment?.boxName} ?`}
          confirmText="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setDeleteAssignment(null)}
        />
      </div>
    </DashboardLayout>
  );
}
