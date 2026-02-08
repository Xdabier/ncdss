import React, { useState } from 'react';
import { X, Pill, Loader2 } from 'lucide-react';
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
import { MedicationRoute, API_ROUTES } from '@ncdss/shared';

interface PrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onSuccess: () => void;
}

// Medication routes with French labels
const MEDICATION_ROUTES = [
  { value: MedicationRoute.PO, label: 'Per os (oral)' },
  { value: MedicationRoute.IV, label: 'Intraveineux' },
  { value: MedicationRoute.IM, label: 'Intramusculaire' },
  { value: MedicationRoute.SC, label: 'Sous-cutané' },
  { value: MedicationRoute.SL, label: 'Sublingual' },
  { value: MedicationRoute.INH, label: 'Inhalation' },
  { value: MedicationRoute.TOP, label: 'Topique' },
  { value: MedicationRoute.PR, label: 'Rectal' },
] as const;

interface FormData {
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
}

interface FormErrors {
  medicationName?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  general?: string;
}

export function PrescriptionModal({
  isOpen,
  onClose,
  patientId,
  onSuccess,
}: PrescriptionModalProps): React.ReactElement | null {
  const [formData, setFormData] = useState<FormData>({
    medicationName: '',
    dosage: '',
    route: '',
    frequency: '',
    duration: '',
    instructions: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.medicationName.trim()) {
      newErrors.medicationName = 'Le nom du médicament est requis';
    }

    if (!formData.dosage.trim()) {
      newErrors.dosage = 'Le dosage est requis';
    }

    if (!formData.route) {
      newErrors.route = 'La voie d\'administration est requise';
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
      await api.post(API_ROUTES.prescriptions.create, {
        patientId,
        medicationName: formData.medicationName.trim(),
        dosage: formData.dosage.trim(),
        route: formData.route,
        frequency: formData.frequency.trim(),
        duration: formData.duration.trim() || null,
        instructions: formData.instructions.trim() || null,
      });

      // Reset form
      setFormData({
        medicationName: '',
        dosage: '',
        route: '',
        frequency: '',
        duration: '',
        instructions: '',
      });

      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('Error creating prescription:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setErrors({
        general:
          axiosError.response?.data?.error ||
          'Erreur lors de la création de la prescription',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    if (!isSubmitting) {
      setFormData({
        medicationName: '',
        dosage: '',
        route: '',
        frequency: '',
        duration: '',
        instructions: '',
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
            <div className="p-2 rounded-lg bg-purple-100">
              <Pill className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold">Nouvelle prescription</h2>
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

          {/* Medication Name (required) */}
          <div className="space-y-2">
            <Label htmlFor="medicationName">
              Nom du médicament <span className="text-red-500">*</span>
            </Label>
            <Input
              id="medicationName"
              type="text"
              placeholder="Nom du médicament"
              value={formData.medicationName}
              onChange={(e) => {
                setFormData({ ...formData, medicationName: e.target.value });
                if (errors.medicationName) {
                  setErrors({ ...errors, medicationName: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.medicationName ? 'border-red-500' : ''}
            />
            {errors.medicationName && (
              <p className="text-sm text-red-500">{errors.medicationName}</p>
            )}
          </div>

          {/* Dosage (required) */}
          <div className="space-y-2">
            <Label htmlFor="dosage">
              Dosage <span className="text-red-500">*</span>
            </Label>
            <Input
              id="dosage"
              type="text"
              placeholder="ex: 500mg, 10ml"
              value={formData.dosage}
              onChange={(e) => {
                setFormData({ ...formData, dosage: e.target.value });
                if (errors.dosage) {
                  setErrors({ ...errors, dosage: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.dosage ? 'border-red-500' : ''}
            />
            {errors.dosage && (
              <p className="text-sm text-red-500">{errors.dosage}</p>
            )}
          </div>

          {/* Route (required) */}
          <div className="space-y-2">
            <Label htmlFor="route">
              Voie d'administration <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.route}
              onValueChange={(value) => {
                setFormData({ ...formData, route: value });
                if (errors.route) {
                  setErrors({ ...errors, route: undefined });
                }
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger
                className={errors.route ? 'border-red-500' : ''}
              >
                <SelectValue placeholder="Sélectionner la voie" />
              </SelectTrigger>
              <SelectContent>
                {MEDICATION_ROUTES.map((route) => (
                  <SelectItem key={route.value} value={route.value}>
                    {route.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.route && (
              <p className="text-sm text-red-500">{errors.route}</p>
            )}
          </div>

          {/* Frequency (required) */}
          <div className="space-y-2">
            <Label htmlFor="frequency">
              Fréquence
            </Label>
            <Input
              id="frequency"
              type="text"
              placeholder="ex: 3x/jour, toutes les 8h"
              value={formData.frequency}
              onChange={(e) => {
                setFormData({ ...formData, frequency: e.target.value });
                if (errors.frequency) {
                  setErrors({ ...errors, frequency: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.frequency ? 'border-red-500' : ''}
            />
            {errors.frequency && (
              <p className="text-sm text-red-500">{errors.frequency}</p>
            )}
          </div>

          {/* Duration (optional) */}
          <div className="space-y-2">
            <Label htmlFor="duration">Durée</Label>
            <Input
              id="duration"
              type="text"
              placeholder="ex: 5 jours, jusqu'à amélioration"
              value={formData.duration}
              onChange={(e) =>
                setFormData({ ...formData, duration: e.target.value })
              }
              disabled={isSubmitting}
            />
          </div>

          {/* Instructions (optional) */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions particulières</Label>
            <textarea
              id="instructions"
              placeholder="Instructions particulières..."
              value={formData.instructions}
              onChange={(e) =>
                setFormData({ ...formData, instructions: e.target.value })
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
              className="flex-1 bg-purple-600 hover:bg-purple-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Prescrire'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
