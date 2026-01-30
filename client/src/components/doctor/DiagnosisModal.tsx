import React, { useState } from 'react';
import { X, Stethoscope, Loader2, Sparkles, CheckCircle, FileText, HelpCircle, Info } from 'lucide-react';
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
import { API_ROUTES } from '@ncdss/shared';

interface InitialDiagnosisData {
  diagnosisCode?: string;
  diagnosisName?: string;
  diagnosisType?: string;
  severity?: string;
  notes?: string;
  aiConfidence?: number; // AI confidence percentage (0-100)
}

interface DiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess: () => void;
  initialData?: InitialDiagnosisData;
}

// Diagnosis type enum values with descriptions
const DIAGNOSIS_TYPES = [
  {
    value: 'PRIMARY',
    label: 'Principal',
    description: 'Diagnostic principal responsable de la consultation',
    icon: CheckCircle,
    color: 'text-green-600'
  },
  {
    value: 'SECONDARY',
    label: 'Secondaire',
    description: 'Diagnostic additionnel, condition coexistante',
    icon: FileText,
    color: 'text-blue-600'
  },
  {
    value: 'DIFFERENTIAL',
    label: 'Différentiel',
    description: 'Hypothèse diagnostique à confirmer ou exclure',
    icon: HelpCircle,
    color: 'text-amber-600'
  },
] as const;

// Severity enum values with colors
const SEVERITY_LEVELS = [
  { value: 'MILD', label: 'Légère', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'MODERATE', label: 'Modérée', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'SEVERE', label: 'Sévère', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'CRITICAL', label: 'Critique', color: 'bg-red-100 text-red-800 border-red-300' },
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
  initialData,
}: DiagnosisModalProps): React.ReactElement | null {
  const getInitialFormData = (): FormData => ({
    diagnosisCode: initialData?.diagnosisCode || '',
    diagnosisName: initialData?.diagnosisName || '',
    diagnosisType: initialData?.diagnosisType || '',
    severity: initialData?.severity || '',
    notes: initialData?.notes || '',
  });

  const [formData, setFormData] = useState<FormData>(getInitialFormData());
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when initialData changes (e.g., from AI suggestion)
  React.useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
    }
  }, [isOpen, initialData]);

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
      await api.post(API_ROUTES.diagnoses.create, {
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
          {/* AI Suggestion Indicator */}
          {initialData?.aiConfidence !== undefined && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Suggestion IA</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-purple-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      initialData.aiConfidence >= 80 ? 'bg-green-500' :
                      initialData.aiConfidence >= 60 ? 'bg-yellow-500' :
                      'bg-orange-500'
                    }`}
                    style={{ width: `${initialData.aiConfidence}%` }}
                  />
                </div>
                <span className={`text-sm font-semibold ${
                  initialData.aiConfidence >= 80 ? 'text-green-700' :
                  initialData.aiConfidence >= 60 ? 'text-yellow-700' :
                  'text-orange-700'
                }`}>
                  {initialData.aiConfidence}%
                </span>
              </div>
              <p className="text-xs text-purple-600 mt-2">
                {initialData.aiConfidence >= 80 ? 'Confiance élevée - à confirmer cliniquement' :
                 initialData.aiConfidence >= 60 ? 'Confiance modérée - examens complémentaires recommandés' :
                 'Confiance faible - hypothèse à explorer'}
              </p>
            </div>
          )}

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
            <p className="text-xs text-gray-500">
              <Info className="h-3 w-3 inline mr-1" />
              Code de la Classification Internationale des Maladies (optionnel)
            </p>
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
            <div className="space-y-2">
              {DIAGNOSIS_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = formData.diagnosisType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, diagnosisType: type.value });
                      if (errors.diagnosisType) {
                        setErrors({ ...errors, diagnosisType: undefined });
                      }
                    }}
                    disabled={isSubmitting}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Icon className={`h-5 w-5 mt-0.5 ${isSelected ? type.color : 'text-gray-400'}`} />
                    <div>
                      <p className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {type.label}
                      </p>
                      <p className="text-xs text-gray-500">{type.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.diagnosisType && (
              <p className="text-sm text-red-500">{errors.diagnosisType}</p>
            )}
          </div>

          {/* Severity (optional) */}
          <div className="space-y-2">
            <Label htmlFor="severity">Sévérité (optionnel)</Label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_LEVELS.map((severity) => {
                const isSelected = formData.severity === severity.value;
                return (
                  <button
                    key={severity.value}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        severity: isSelected ? '' : severity.value
                      })
                    }
                    disabled={isSubmitting}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      isSelected
                        ? severity.color + ' border-current'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {severity.label}
                  </button>
                );
              })}
            </div>
            {formData.severity && (
              <p className="text-xs text-gray-500">
                Cliquez à nouveau pour désélectionner
              </p>
            )}
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
