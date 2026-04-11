import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { getApi } from '../../services/api';
import { Patient, HoldStatus, API_ROUTES } from '@ncdss/shared';
import { X, RefreshCw, Pause } from 'lucide-react';

interface HoldPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  onSuccess: () => void;
}

const holdStatusLabels: Record<HoldStatus, string> = {
  waiting_for_treatment: 'En attente de soins au box',
  waiting_for_exams: "En attente d'examens compl\u00e9mentaires",
  waiting_for_specialist: "En attente d'un sp\u00e9cialiste",
  patient_absent: "Patient absent \u00e0 l'appel",
  treatment_done: 'Soins termin\u00e9s \u2014 pr\u00eat \u00e0 reprendre',
};

export function HoldPatientModal({
  isOpen,
  onClose,
  patient,
  onSuccess,
}: HoldPatientModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdStatus, setHoldStatus] = useState<HoldStatus | ''>('');
  const [holdReason, setHoldReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!holdStatus) {
      setError('Veuillez s\u00e9lectionner un motif de mise en attente');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.hold(patient.id), {
        holdStatus,
        holdReason: holdReason.trim() || undefined,
      });
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || 'Erreur lors de la mise en attente');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setHoldStatus('');
    setHoldReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Pause className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold">Mettre en attente</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Patient info */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-900">{patient.fullName}</p>
            <p className="text-sm text-gray-600">
              {patient.age} ans
              {patient.chiefComplaint && ` | ${patient.chiefComplaint}`}
            </p>
          </div>

          {/* Hold reason select */}
          <div>
            <Label>
              Motif de la mise en attente <span className="text-red-500">*</span>
            </Label>
            <Select
              value={holdStatus}
              onValueChange={(v) => setHoldStatus(v as HoldStatus)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="S\u00e9lectionner un motif" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(holdStatusLabels) as [HoldStatus, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Optional notes */}
          <div>
            <Label htmlFor="holdReason">Pr\u00e9cisions (optionnel)</Label>
            <textarea
              id="holdReason"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="Ex: Bilan sanguin demand\u00e9, r\u00e9sultats attendus..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={3}
              disabled={loading}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !holdStatus}
              className="flex-1 bg-amber-600 hover:bg-amber-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  En cours...
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Mettre en attente
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HoldPatientModal;
