import React, { useState } from 'react';
import { X, Stethoscope, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { getApi } from '../../services/api';

interface DiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess: () => void;
}

// Diagnosis type enum values
const DIAGNOSIS_TYPES = [
  { value: 'PRIMARY', label: 'Principal' },
  { value: 'SECONDARY', label: 'Secondaire' },
  { value: 'DIFFERENTIAL', label: 'Différentiel' },
] as const;

// Severity enum values
const SEVERITY_LEVELS = [
  { value: 'MILD', label: 'Légère' },
  { value: 'MODERATE', label: 'Modérée' },
  { value: 'SEVERE', label: 'Sévère' },
  { value: 'CRITICAL', label: 'Critique' },
] as const;

interface FormData {
  diagnosisCode: string;
  diagnosisName: string;
  diagnosisType: string;
  severity: string;
  notes: string;
}

interface FormErrors {
  diagnosisName?: string;
  diagnosisType?: string;
  general?: string;
}

export function DiagnosisModal({
  isOpen,
  onClose,
  patientId,
  onSuccess,
}: DiagnosisModalProps): React.ReactElement | null {
  const [formData, setFormData] = useState<FormData>({
    diagnosisCode: '',
    diagnosisName: '',
    diagnosisType: '',
    severity: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.diagnosisName.trim()) {
      newErrors.diagnosisName = 'Le nom du diagnostic est requis';
    }

    if (!formData.diagnosisType) {
      newErrors.diagnosisType = 'Le type de diagnostic est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const api = await getApi();
      await api.post('/diagnoses', {
        patientId,
        diagnosisCode: formData.diagnosisCode.trim() || null,
        diagnosisName: formData.diagnosisName.trim(),
        diagnosisType: formData.diagnosisType,
        severity: formData.severity || null,
        notes: formData.notes.trim() || null,
      });

      // Reset form
      setFormData({
        diagnosisCode: '',
        diagnosisName: '',
        diagnosisType: '',
        severity: '',
        notes: '',
      });

      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('Error creating diagnosis:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setErrors({
        general:
          axiosError.response?.data?.error ||
          'Erreur lors de la création du diagnostic',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    if (!isSubmitting) {
      setFormData({
        diagnosisCode: '',
        diagnosisName: '',
        diagnosisType: '',
        severity: '',
        notes: '',
      });
      setErrors({});
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Stethoscope className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">Nouveau diagnostic</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* General error */}
          {errors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {errors.general}
            </div>
          )}

          {/* Diagnosis Code (optional) */}
          <div className="space-y-2">
            <Label htmlFor="diagnosisCode">Code CIM-10</Label>
            <Input
              id="diagnosisCode"
              type="text"
              placeholder="Ex: J18.9, I10, E11.9..."
              value={formData.diagnosisCode}
              onChange={(e) =>
                setFormData({ ...formData, diagnosisCode: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>

          {/* Diagnosis Name (required) */}
          <div className="space-y-2">
            <Label htmlFor="diagnosisName">
              Nom du diagnostic <span className="text-red-500">*</span>
            </Label>
            <Input
              id="diagnosisName"
              type="text"
              placeholder="Nom du diagnostic"
              value={formData.diagnosisName}
              onChange={(e) => {
                setFormData({ ...formData, diagnosisName: e.target.value });
                if (errors.diagnosisName) {
                  setErrors({ ...errors, diagnosisName: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.diagnosisName ? 'border-red-500' : ''}
            />
            {errors.diagnosisName && (
              <p className="text-sm text-red-500">{errors.diagnosisName}</p>
            )}
          </div>

          {/* Diagnosis Type (required) */}
          <div className="space-y-2">
            <Label htmlFor="diagnosisType">
              Type de diagnostic <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.diagnosisType}
              onValueChange={(value) => {
                setFormData({ ...formData, diagnosisType: value });
                if (errors.diagnosisType) {
                  setErrors({ ...errors, diagnosisType: undefined });
                }
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger
                className={errors.diagnosisType ? 'border-red-500' : ''}
              >
                <SelectValue placeholder="Sélectionner le type" />
              </SelectTrigger>
              <SelectContent>
                {DIAGNOSIS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.diagnosisType && (
              <p className="text-sm text-red-500">{errors.diagnosisType}</p>
            )}
          </div>

          {/* Severity (optional) */}
          <div className="space-y-2">
            <Label htmlFor="severity">Sévérité</Label>
            <Select
              value={formData.severity}
              onValueChange={(value) =>
                setFormData({ ...formData, severity: value })
              }
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner la sévérité (optionnel)" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_LEVELS.map((severity) => (
                  <SelectItem key={severity.value} value={severity.value}>
                    {severity.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes cliniques</Label>
            <textarea
              id="notes"
              placeholder="Notes cliniques..."
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              disabled={isSubmitting}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
