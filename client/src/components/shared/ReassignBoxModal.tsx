import React, { useState, useEffect } from 'react';
import { BedDouble, Check, Stethoscope, Users, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getApi } from '../../services/api';
import { Patient, Box, BoxType, PatientStatus, API_ROUTES } from '@ncdss/shared';

interface ReassignBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  patientId: string;
  patientName: string;
  currentBoxId?: string;
  orientation?: string;
  esiLevel?: number;
}

interface BoxOccupancy {
  patientCount: number;
  patientNames: string[];
}

interface BoxWithDoctor extends Box {
  currentDoctor: { doctorId: string; doctorName: string } | null;
}

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumatologie',
  PEDIATRIC: 'Pédiatrie',
};

const boxTypeLabels: Record<string, string> = {
  TRIAGE: 'Triage',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumatologie',
  SAUV: 'SAUV',
};

const orientationToBoxTypes: Record<string, BoxType[]> = {
  SAUV: [BoxType.SAUV],
  MEDICAL: [BoxType.MEDICAL],
  SURGICAL: [BoxType.SURGICAL],
  TRAUMA: [BoxType.TRAUMA],
  PEDIATRIC: [BoxType.MEDICAL],
};

export function ReassignBoxModal({
  isOpen,
  onClose,
  onSuccess,
  patientId,
  patientName,
  currentBoxId,
  orientation,
}: ReassignBoxModalProps): React.ReactElement | null {
  const [boxes, setBoxes] = useState<BoxWithDoctor[]>([]);
  const [boxOccupancy, setBoxOccupancy] = useState<Map<string, BoxOccupancy>>(new Map());
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBoxes();
      setSelectedBoxId(null);
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  const loadBoxes = async (): Promise<void> => {
    try {
      setLoading(true);
      const api = await getApi();

      const [boxesRes, occupancyRes] = await Promise.all([
        api.get(API_ROUTES.config.boxes),
        api.get(API_ROUTES.patients.list, {
          params: {
            status: [PatientStatus.IN_TREATMENT, PatientStatus.WITH_DOCTOR],
          },
        }),
      ]);

      const activeBoxes = boxesRes.data.filter((b: Box) => b.isActive);

      const boxesWithDoctors: BoxWithDoctor[] = await Promise.all(
        activeBoxes.map(async (box: Box) => {
          try {
            const doctorRes = await api.get(API_ROUTES.boxAssignments.currentDoctor(box.id));
            return {
              ...box,
              currentDoctor: doctorRes.data
                ? { doctorId: doctorRes.data.doctorId, doctorName: doctorRes.data.doctorName }
                : null,
            };
          } catch {
            return { ...box, currentDoctor: null };
          }
        })
      );
      setBoxes(boxesWithDoctors);

      const occupancyMap = new Map<string, BoxOccupancy>();
      const patientsInBoxes = occupancyRes.data as Patient[];

      activeBoxes.forEach((box: Box) => {
        occupancyMap.set(box.id, { patientCount: 0, patientNames: [] });
      });

      patientsInBoxes.forEach((p: Patient) => {
        if (p.assignedBoxId) {
          const existing = occupancyMap.get(p.assignedBoxId) || { patientCount: 0, patientNames: [] };
          existing.patientCount++;
          existing.patientNames.push(p.fullName);
          occupancyMap.set(p.assignedBoxId, existing);
        }
      });

      setBoxOccupancy(occupancyMap);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Erreur de chargement des boxes');
    } finally {
      setLoading(false);
    }
  };

  const getRecommendedBoxes = (): BoxWithDoctor[] => {
    if (!orientation) return [];
    const allowedTypes = orientationToBoxTypes[orientation] || [];
    return boxes.filter((box) => allowedTypes.includes(box.boxType as BoxType));
  };

  const getOtherBoxes = (): BoxWithDoctor[] => {
    if (!orientation) return boxes;
    const allowedTypes = orientationToBoxTypes[orientation] || [];
    return boxes.filter((box) => !allowedTypes.includes(box.boxType as BoxType));
  };

  const getAvailabilityStatus = (boxId: string): { color: string; label: string; bgColor: string } => {
    const occupancy = boxOccupancy.get(boxId);
    const count = occupancy?.patientCount ?? 0;

    if (count === 0) {
      return { color: 'text-green-600', label: 'Disponible', bgColor: 'bg-green-100' };
    } else if (count === 1) {
      return { color: 'text-yellow-600', label: 'Occupé (1)', bgColor: 'bg-yellow-100' };
    } else {
      return { color: 'text-red-600', label: `Occupé (${count})`, bgColor: 'bg-red-100' };
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!selectedBoxId) return;

    try {
      setSubmitting(true);
      setError(null);
      const api = await getApi();

      await api.post(API_ROUTES.patients.reassignBox(patientId), {
        newBoxId: selectedBoxId,
        reason: reason.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Erreur lors de la réorientation');
    } finally {
      setSubmitting(false);
    }
  };

  const renderBoxCard = (box: BoxWithDoctor, isRecommended: boolean): React.ReactElement => {
    const availability = getAvailabilityStatus(box.id);
    const occupancy = boxOccupancy.get(box.id);
    const isSelected = selectedBoxId === box.id;
    const isCurrent = box.id === currentBoxId;

    return (
      <button
        key={box.id}
        onClick={() => !isCurrent && setSelectedBoxId(box.id)}
        disabled={submitting || isCurrent}
        className={`p-4 rounded-lg border-2 text-left transition-all ${
          isCurrent
            ? 'border-gray-300 bg-gray-100 opacity-60 cursor-not-allowed'
            : isSelected
              ? isRecommended
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        } ${submitting ? 'opacity-50 cursor-not-allowed' : !isCurrent ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold">{box.name}</span>
          <div className="flex items-center gap-1">
            {isCurrent && (
              <Badge variant="secondary" className="text-xs">
                Actuel
              </Badge>
            )}
            {isSelected && (
              <Check className={`h-5 w-5 ${isRecommended ? 'text-green-600' : 'text-blue-600'}`} />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {boxTypeLabels[box.boxType] || box.boxType}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${availability.bgColor} ${availability.color}`}>
            {availability.label}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <Stethoscope className="h-3 w-3 flex-shrink-0 text-gray-400" />
          <span className={`text-xs ${box.currentDoctor ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
            {box.currentDoctor ? `Dr. ${box.currentDoctor.doctorName}` : 'Aucun médecin'}
          </span>
        </div>
        {occupancy && occupancy.patientCount > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="h-3 w-3" />
              <span className="truncate">
                {occupancy.patientNames.slice(0, 2).join(', ')}
                {occupancy.patientNames.length > 2 && ` +${occupancy.patientNames.length - 2}`}
              </span>
            </div>
          </div>
        )}
      </button>
    );
  };

  const recommendedBoxes = getRecommendedBoxes();
  const otherBoxes = getOtherBoxes();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-blue-500" />
            Réorienter le patient
          </DialogTitle>
          <DialogDescription>
            {patientName}
            {orientation && ` — Orientation: ${orientationLabels[orientation] || orientation}`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recommended boxes */}
            {recommendedBoxes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-green-500" />
                  Boxes recommandés
                  {orientation && (
                    <Badge variant="secondary" className="text-xs">
                      {orientationLabels[orientation] || orientation}
                    </Badge>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {recommendedBoxes.map((box) => renderBoxCard(box, true))}
                </div>
              </div>
            )}

            {/* Other boxes */}
            {otherBoxes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-gray-400" />
                  Autres boxes
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {otherBoxes.map((box) => renderBoxCard(box, false))}
                </div>
              </div>
            )}

            {boxes.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <BedDouble className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Aucun box disponible</p>
              </div>
            )}

            {/* Reason textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Raison de la réorientation (optionnel)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Décrivez la raison de la réorientation..."
                className="w-full border rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                disabled={submitting}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedBoxId || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Réorientation...
              </>
            ) : (
              'Confirmer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
