import React, { useState, useEffect } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
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

export interface Pathology {
  id: number;
  name: string;
  nameNormalized?: string;
  pathologyName?: string;
  category: string;
  primaryOrientation: string;
  secondaryOrientation?: string | null;
  isMultiCategory?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface PathologyModalProps {
  open: boolean;
  onClose: () => void;
  pathology?: Pathology | null;
  onSave: () => void;
  existingCategories: string[];
}

const ORIENTATIONS = [
  { value: 'SAUV', label: 'SAUV' },
  { value: 'MEDICAL', label: 'Médical' },
  { value: 'SURGICAL', label: 'Chirurgical' },
  { value: 'TRAUMA', label: 'Trauma' },
  { value: 'PEDIATRIC', label: 'Pédiatrie' },
];

interface FormData {
  name: string;
  category: string;
  primaryOrientation: string;
  secondaryOrientation: string;
}

interface FormErrors {
  name?: string;
  category?: string;
  primaryOrientation?: string;
  general?: string;
}

export function PathologyModal({
  open,
  onClose,
  pathology,
  onSave,
  existingCategories,
}: PathologyModalProps): React.ReactElement | null {
  const isEditMode = !!pathology;

  const getInitialFormData = (): FormData => ({
    name: pathology?.name || '',
    category: pathology?.category || '',
    primaryOrientation: pathology?.primaryOrientation || '',
    secondaryOrientation: pathology?.secondaryOrientation || '',
  });

  const [formData, setFormData] = useState<FormData>(getInitialFormData());
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useNewCategory, setUseNewCategory] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(getInitialFormData());
      setErrors({});
      setUseNewCategory(false);
    }
  }, [open, pathology]);

  if (!open) return null;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Le nom du motif est requis';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'La catégorie est requise';
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
        name: formData.name.trim(),
        category: formData.category.trim(),
        primaryOrientation: formData.primaryOrientation,
        secondaryOrientation: formData.secondaryOrientation || null,
      };

      if (isEditMode && pathology) {
        await api.put(`/pathologies/${pathology.id}`, payload);
      } else {
        await api.post('/pathologies', payload);
      }

      onSave();
      onClose();
    } catch (error: unknown) {
      console.error('Error saving pathology:', error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setErrors({
        general:
          axiosError.response?.data?.error ||
          'Erreur lors de la sauvegarde du motif de consultation',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    if (!isSubmitting) {
      setFormData({
        name: '',
        category: '',
        primaryOrientation: '',
        secondaryOrientation: '',
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
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">
              {isEditMode ? 'Modifier le motif' : 'Nouveau motif de consultation'}
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

          {/* Name (required) */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Nom du motif <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Ex: Douleur thoracique, Dyspnée..."
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) {
                  setErrors({ ...errors, name: undefined });
                }
              }}
              disabled={isSubmitting}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">
              Catégorie <span className="text-red-500">*</span>
            </Label>
            {!useNewCategory && existingCategories.length > 0 ? (
              <div className="space-y-2">
                <Select
                  value={formData.category}
                  onValueChange={(value) => {
                    setFormData({ ...formData, category: value });
                    if (errors.category) {
                      setErrors({ ...errors, category: undefined });
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className={errors.category ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Sélectionner une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setUseNewCategory(true)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  + Créer une nouvelle catégorie
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  id="category"
                  type="text"
                  placeholder="Ex: Médical, Chirurgical, Trauma..."
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({ ...formData, category: e.target.value });
                    if (errors.category) {
                      setErrors({ ...errors, category: undefined });
                    }
                  }}
                  disabled={isSubmitting}
                  className={errors.category ? 'border-red-500' : ''}
                />
                {existingCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseNewCategory(false)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Choisir une catégorie existante
                  </button>
                )}
              </div>
            )}
            {errors.category && <p className="text-sm text-red-500">{errors.category}</p>}
          </div>

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
                <SelectValue placeholder="Sélectionner une orientation" />
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
            <Label htmlFor="secondaryOrientation">Orientation secondaire (optionnel)</Label>
            <Select
              value={formData.secondaryOrientation}
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
            <p className="text-xs text-gray-500">
              Utilisé pour les pathologies multi-catégories (ex: Médical / SAUV)
            </p>
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
