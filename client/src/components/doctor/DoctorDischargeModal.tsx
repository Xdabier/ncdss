import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { getApi } from '../../services/api';
import {
  Patient,
  Sex,
  Diagnosis,
  DiagnosisType,
  DiagnosisStatus,
  PrescriptionStatus,
  API_ROUTES,
} from '@ncdss/shared';
import {
  X,
  RefreshCw,
  LogOut,
  AlertTriangle,
  CheckCircle,
  FileText,
  HelpCircle,
  Pill,
} from 'lucide-react';

interface DoctorDischargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  diagnoses: Diagnosis[];
  onSuccess: () => void;
}

// French labels
const dischargeTypeLabels: Record<string, string> = {
  'home': 'Retour à domicile',
  'transfer': 'Transfert vers un autre service',
  'left_ama': 'Sorti contre avis médical',
  'deceased': 'Décès',
  'admission': 'Hospitalisation',
};

// Grouped discharge types for the select
const dischargeGroups = [
  {
    label: 'Sortie définitive',
    types: ['home', 'transfer', 'left_ama', 'deceased'] as const,
  },
  {
    label: 'Hospitalisation',
    types: ['admission'] as const,
  },
];

const diagnosisTypeLabels: Record<DiagnosisType, string> = {
  [DiagnosisType.PRIMARY]: 'Principal',
  [DiagnosisType.SECONDARY]: 'Secondaire',
  [DiagnosisType.DIFFERENTIAL]: 'Différentiel',
};

const diagnosisStatusLabels: Record<DiagnosisStatus, string> = {
  [DiagnosisStatus.ACTIVE]: 'Actif',
  [DiagnosisStatus.RESOLVED]: 'Résolu',
  [DiagnosisStatus.RULED_OUT]: 'Écarté',
};

export function DoctorDischargeModal({
  isOpen,
  onClose,
  patient,
  diagnoses,
  onSuccess,
}: DoctorDischargeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dischargeType, setDischargeType] = useState('home');
  const [dischargeNotes, setDischargeNotes] = useState('');

  if (!isOpen) return null;

  // Check if patient has at least one PRIMARY diagnosis that is ACTIVE or CONFIRMED
  const hasPrimaryDiagnosis = diagnoses.some(
    (d) =>
      d.diagnosisType === DiagnosisType.PRIMARY &&
      (d.status === DiagnosisStatus.ACTIVE || d.confirmedAt)
  );

  // Count active prescriptions (for display)
  const activePrescriptionsCount = 0; // Prescriptions are not passed to this modal, we'll show diagnoses instead

  // Get type icon
  const getTypeIcon = (type: DiagnosisType) => {
    switch (type) {
      case DiagnosisType.PRIMARY:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case DiagnosisType.SECONDARY:
        return <FileText className="h-4 w-4 text-blue-600" />;
      case DiagnosisType.DIFFERENTIAL:
        return <HelpCircle className="h-4 w-4 text-amber-600" />;
      default:
        return null;
    }
  };

  // Get type badge variant
  const getTypeBadgeVariant = (type: DiagnosisType): 'success' | 'info' | 'warning' | 'secondary' => {
    switch (type) {
      case DiagnosisType.PRIMARY:
        return 'success';
      case DiagnosisType.SECONDARY:
        return 'info';
      case DiagnosisType.DIFFERENTIAL:
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const handleDischarge = async () => {

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.discharge(patient.id), {
        dischargeType,
        dischargeNotes: dischargeNotes.trim() || null,
      });
      onSuccess();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || 'Erreur lors de la sortie du patient');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setDischargeType('home');
    setDischargeNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <LogOut className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Sortie du Patient</h2>
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
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Validation Warning */}
          {!hasPrimaryDiagnosis && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Aucun diagnostic principal enregistré.
              </AlertDescription>
            </Alert>
          )}

          {/* Patient Summary */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-900">{patient.fullName}</p>
            <p className="text-sm text-gray-600">
              {patient.age} ans, {patient.sex === Sex.MALE ? 'Homme' : 'Femme'}
              {patient.nationalId && ` | CIN: ${patient.nationalId}`}
            </p>
          </div>

          {/* Diagnoses List */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Diagnostics ({diagnoses.length})
            </Label>
            {diagnoses.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Aucun diagnostic enregistré</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {diagnoses.map((diagnosis) => (
                  <div
                    key={diagnosis.id}
                    className={`flex items-center justify-between p-2 rounded-lg border ${
                      diagnosis.diagnosisType === DiagnosisType.PRIMARY
                        ? 'border-green-200 bg-green-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {getTypeIcon(diagnosis.diagnosisType)}
                      <span className="text-sm font-medium">{diagnosis.diagnosisName}</span>
                    </div>
                    <Badge variant={getTypeBadgeVariant(diagnosis.diagnosisType)} className="text-xs">
                      {diagnosisTypeLabels[diagnosis.diagnosisType]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discharge Type */}
          <div>
            <Label htmlFor="dischargeType">
              Type de sortie <span className="text-red-500">*</span>
            </Label>
            <Select value={dischargeType} onValueChange={setDischargeType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dischargeGroups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {dischargeTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Discharge Notes */}
          <div>
            <Label htmlFor="dischargeNotes">Notes de sortie</Label>
            <textarea
              id="dischargeNotes"
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              placeholder="Consignes de sortie, rendez-vous de suivi, recommandations..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={4}
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
              onClick={handleDischarge}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4 mr-2" />
                  Confirmer la sortie
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DoctorDischargeModal;
