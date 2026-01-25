import React, { useState, useEffect } from 'react';
import { X, Stethoscope, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { getApi } from '../../services/api';

export interface Intervention {
  id: number;
  pathologyName: string;
  pathologyNameNormalized?: string;
  abcdeCategory: string;
  category?: string; // Alias
  severitySigns: string[];
  nursingInterventions: string[];
  medicalInterventions: string[];
  dosageFormulas?: string;
  orientation?: string;
  primaryOrientation: string;
  secondaryOrientation?: string | null;
  isSAUV: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface InterventionModalProps {
  open: boolean;
  onClose: () => void;
  intervention?: Intervention | null;
  onSave: () => void;
}

const ABCDE_CATEGORIES = [
  { value: 'A', label: 'A - Airway (Voies aériennes)' },
  { value: 'B', label: 'B - Breathing (Respiration)' },
  { value: 'C', label: 'C - Circulation' },
  { value: 'D', label: 'D - Disability (Neurologique)' },
  { value: 'E', label: 'E - Exposure (Exposition)' },
  { value: 'GENERAL', label: 'Général' },
];

const ORIENTATIONS = [
  { value: 'SAUV', label: 'SAUV' },
  { value: 'MEDICAL', label: 'Médical' },
  { value: 'SURGICAL', label: 'Chirurgical' },
  { value: 'TRAUMA', label: 'Trauma' },
];

interface FormData {
  pathologyName: string;
  abcdeCategory: string;
  severitySigns: string;
  nursingInterventions: string;
  medicalInterventions: string;
  dosageFormulas: string;
  primaryOrientation: string;
  secondaryOrientation: string;
  isSAUV: boolean;
}

interface FormErrors {
  pathologyName?: string;
  abcdeCategory?: string;
  primaryOrientation?: string;
  general?: string;
}

export function InterventionModal({
  open,
  onClose,
  intervention,
  onSave,
}: InterventionModalProps): React.ReactElement | null {
  const isEditMode = !!intervention;

  const getInitialFormData = (): FormData => ({
    pathologyName: intervention?.pathologyName || '',
    abcdeCategory: intervention?.abcdeCategory || '',
    severitySigns: intervention?.severitySigns?.join('\n') || '',
    nursingInterventions: intervention?.nursingInterventions?.join('\n') || '',
    medicalInterventions: intervention?.medicalInterventions?.join('\n') || '',
    dosageFormulas: intervention?.dosageFormulas || '',
    primaryOrientation: intervention?.primaryOrientation || '',
    secondaryOrientation: intervention?.secondaryOrientation || '',
    isSAUV: intervention?.isSAUV || false,
  });

  const [formData, setFormData] = useState<FormData>(getInitialFormData());
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setErrors({});
    }
  }, [open, intervention]);

  if (!open) return null;

  const parseTextareaToArray = (text: string): string[] => {
    return text
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.pathologyName.trim()) {
      newErrors.pathologyName = 'Le nom de la pathologie est requis';
    }

    if (!formData.abcdeCategory) {
      newErrors.abcdeCategory = 'La catégorie ABCDE est requise';
    }

    if (!formData.primaryOrientation) {
      newErrors.primaryOrientation = "L'orientation primaire est requise";
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
      const payload = {
        pathologyName: formData.pathologyName.trim(),
        abcdeCategory: formData.abcdeCategory,
        severitySigns: parseTextareaToArray(formData.severitySigns),
        nursingInterventions: parseTextareaToArray(formData.nursingInterventions),
        medicalInterventions: parseTextareaToArray(formData.medicalInterventions),
        dosageFormulas: formData.dosageFormulas.trim(),
        primaryOrientation: formData.primaryOrientation,
        secondaryOrientation: formData.secondaryOrientation || null,
        isSAUV: formData.isSAUV,
      };

      if (isEditMode && intervention) {
        await api.put(`/interventions/${intervention.id}`, payload);
      } else {
        await api.post('/interventions', payload);
      }

      onSave();
      onClose();
    } catch (error: unknown) {
      console.error('Error saving intervention:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setErrors({
        general:
          axiosError.response?.data?.error ||
          'Erreur lors de la sauvegarde de la pathologie clinique',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    if (!isSubmitting) {
      setFormData({
        pathologyName: '',
        abcdeCategory: '',
        severitySigns: '',
        nursingInterventions: '',
        medicalInterventions: '',
        dosageFormulas: '',
        primaryOrientation: '',
        secondaryOrientation: '',
        isSAUV: false,
      });
      setErrors({});
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Stethoscope className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold">
              {isEditMode ? 'Modifier la pathologie' : 'Nouvelle pathologie clinique'}
            </h2>
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

          {/* Pathology Name (required) */}
          <div className="space-y-2">
            <Label htmlFor="pathologyName">
              Nom de la pathologie <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pathologyName"
              type="text"
              placeholder="Ex: Asthme sévère, Choc hémorragique..."
              value={formData.pathologyName}
              onChange={(e) => {
                setFormData({ ...formData, pathologyName: e.target.value });
                if (errors.pathologyName) {
                  setErrors({ ...errors, pathologyName: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.pathologyName ? 'border-red-500' : ''}
            />
            {errors.pathologyName && <p className="text-sm text-red-500">{errors.pathologyName}</p>}
          </div>

          {/* ABCDE Category (required) */}
          <div className="space-y-2">
            <Label htmlFor="abcdeCategory">
              Catégorie ABCDE <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.abcdeCategory}
              onValueChange={(value) => {
                setFormData({ ...formData, abcdeCategory: value });
                if (errors.abcdeCategory) {
                  setErrors({ ...errors, abcdeCategory: undefined });
                }
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger className={errors.abcdeCategory ? 'border-red-500' : ''}>
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {ABCDE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.abcdeCategory && <p className="text-sm text-red-500">{errors.abcdeCategory}</p>}
          </div>

          {/* Severity Signs */}
          <div className="space-y-2">
            <Label htmlFor="severitySigns">Signes de gravité</Label>
            <textarea
              id="severitySigns"
              placeholder="Un signe par ligne ou séparés par des virgules"
              value={formData.severitySigns}
              onChange={(e) => setFormData({ ...formData, severitySigns: e.target.value })}
              disabled={isSubmitting}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-gray-500">
              Ex: Détresse respiratoire, Cyanose, SpO2 &lt; 90%
            </p>
          </div>

          {/* Nursing Interventions */}
          <div className="space-y-2">
            <Label htmlFor="nursingInterventions">Interventions infirmières</Label>
            <textarea
              id="nursingInterventions"
              placeholder="Une intervention par ligne"
              value={formData.nursingInterventions}
              onChange={(e) => setFormData({ ...formData, nursingInterventions: e.target.value })}
              disabled={isSubmitting}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Medical Interventions */}
          <div className="space-y-2">
            <Label htmlFor="medicalInterventions">Interventions médicales</Label>
            <textarea
              id="medicalInterventions"
              placeholder="Une intervention par ligne"
              value={formData.medicalInterventions}
              onChange={(e) => setFormData({ ...formData, medicalInterventions: e.target.value })}
              disabled={isSubmitting}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Dosage Formulas */}
          <div className="space-y-2">
            <Label htmlFor="dosageFormulas">Formules de dosage</Label>
            <Input
              id="dosageFormulas"
              type="text"
              placeholder="Ex: Adrénaline 0.01mg/kg IV"
              value={formData.dosageFormulas}
              onChange={(e) => setFormData({ ...formData, dosageFormulas: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          {/* Orientations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Orientation (required) */}
            <div className="space-y-2">
              <Label htmlFor="primaryOrientation">
                Orientation primaire <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.primaryOrientation}
                onValueChange={(value) => {
                  setFormData({ ...formData, primaryOrientation: value });
                  if (errors.primaryOrientation) {
                    setErrors({ ...errors, primaryOrientation: undefined });
                  }
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger className={errors.primaryOrientation ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {ORIENTATIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.primaryOrientation && (
                <p className="text-sm text-red-500">{errors.primaryOrientation}</p>
              )}
            </div>

            {/* Secondary Orientation (optional) */}
            <div className="space-y-2">
              <Label htmlFor="secondaryOrientation">Orientation secondaire</Label>
              <Select
                value={formData.secondaryOrientation || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, secondaryOrientation: value === 'none' ? '' : value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {ORIENTATIONS.filter((o) => o.value !== formData.primaryOrientation).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SAUV Checkbox */}
          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Checkbox
              id="isSAUV"
              checked={formData.isSAUV}
              onCheckedChange={(checked) => setFormData({ ...formData, isSAUV: checked })}
              disabled={isSubmitting}
            />
            <label htmlFor="isSAUV" className="cursor-pointer">
              <p className="font-medium text-red-700">Pathologie critique (SAUV)</p>
              <p className="text-sm text-red-600">
                Cocher si cette pathologie nécessite une prise en charge immédiate en SAUV
              </p>
            </label>
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
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : isEditMode ? (
                'Mettre à jour'
              ) : (
                'Créer'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
