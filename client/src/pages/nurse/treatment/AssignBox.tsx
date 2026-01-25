import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, AlertTriangle, Check, Play, Users, Filter } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Box, BoxType, Sex, PatientStatus } from '@ncdss/shared';

// Box occupancy info
interface BoxOccupancy {
  patientCount: number;
  patientNames: string[];
}

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Orientation labels in French
const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumatologie',
  PEDIATRIC: 'Pédiatrie',
};

// Box type labels in French
const boxTypeLabels: Record<string, string> = {
  TRIAGE: 'Triage',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumatologie',
  SAUV: 'SAUV',
};

// Map orientation to box types
const orientationToBoxTypes: Record<string, BoxType[]> = {
  SAUV: [BoxType.SAUV],
  MEDICAL: [BoxType.MEDICAL],
  SURGICAL: [BoxType.SURGICAL],
  TRAUMA: [BoxType.TRAUMA],
  PEDIATRIC: [BoxType.MEDICAL], // Pediatric goes to medical boxes
};

export default function AssignBox() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxOccupancy, setBoxOccupancy] = useState<Map<string, BoxOccupancy>>(new Map());
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [showAllBoxes, setShowAllBoxes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load patient, boxes, and occupancy
  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();

        const [patientRes, boxesRes, occupancyRes] = await Promise.all([
          api.get(`/patients/${id}`),
          api.get('/config/boxes'),
          // Get patients currently in treatment or with doctor (have a box assigned)
          api.get('/patients', {
            params: {
              status: [PatientStatus.IN_TREATMENT, PatientStatus.WITH_DOCTOR].join(','),
            },
          }),
        ]);

        setPatient(patientRes.data);
        const activeBoxes = boxesRes.data.filter((b: Box) => b.isActive);
        setBoxes(activeBoxes);

        // Calculate occupancy per box
        const occupancyMap = new Map<string, BoxOccupancy>();
        const patientsInBoxes = occupancyRes.data as Patient[];

        // Initialize all boxes with 0 occupancy
        activeBoxes.forEach((box: Box) => {
          occupancyMap.set(box.id, { patientCount: 0, patientNames: [] });
        });

        // Count patients per box
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
        setError(err.response?.data?.error || 'Erreur de chargement des données');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  // Filter boxes based on patient's orientation
  const getRecommendedBoxes = (): Box[] => {
    if (!patient?.finalOrientation) return [];

    const allowedTypes = orientationToBoxTypes[patient.finalOrientation] || [];
    return boxes.filter((box) => allowedTypes.includes(box.boxType as BoxType));
  };

  // Get other available boxes
  const getOtherBoxes = (): Box[] => {
    if (!patient?.finalOrientation) return boxes;

    const allowedTypes = orientationToBoxTypes[patient.finalOrientation] || [];
    return boxes.filter((box) => !allowedTypes.includes(box.boxType as BoxType));
  };

  // Get availability status for a box
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

  // Render a single box card
  const renderBoxCard = (box: Box, isRecommended: boolean): React.ReactElement => {
    const availability = getAvailabilityStatus(box.id);
    const occupancy = boxOccupancy.get(box.id);
    const isSelected = selectedBoxId === box.id;

    return (
      <button
        key={box.id}
        onClick={() => setSelectedBoxId(box.id)}
        disabled={submitting}
        className={`p-4 rounded-lg border-2 text-left transition-all ${
          isSelected
            ? isRecommended
              ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
              : 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        } ${submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold">{box.name}</span>
          {isSelected && (
            <Check className={`h-5 w-5 ${isRecommended ? 'text-green-600' : 'text-blue-600'}`} />
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {boxTypeLabels[box.boxType] || box.boxType}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${availability.bgColor} ${availability.color}`}>
            {availability.label}
          </span>
        </div>
        {/* Show patient names if occupied */}
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

  const handleStartTreatment = async (boxId?: string): Promise<void> => {
    if (!id) return;

    try {
      setSubmitting(true);
      setError(null);
      const api = await getApi();

      await api.post(`/patients/${id}/start-treatment`, {
        boxId: boxId || null,
      });

      // Navigate to patient care page
      navigate(`/nurse/treatment/${id}/care`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Erreur lors de la prise en charge');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600">Chargement...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-3xl mx-auto">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Patient non trouvé</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const recommendedBoxes = getRecommendedBoxes();
  const otherBoxes = getOtherBoxes();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/nurse/treatment')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Assignation Box</h1>
            <p className="text-sm text-gray-600">Sélectionnez un box pour le patient</p>
          </div>
        </div>

        {/* Patient Summary Card */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{patient.fullName}</h2>
                <p className="text-gray-600">
                  {patient.age} ans, {patient.sex === Sex.MALE ? 'Homme' : 'Femme'}
                </p>
                {patient.chiefComplaint && (
                  <p className="mt-2 text-sm">
                    <span className="text-gray-500">Motif:</span> {patient.chiefComplaint}
                  </p>
                )}
              </div>
              <div className="text-right space-y-2">
                {/* ESI Badge */}
                <div
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${esiColors[patient.esiLevel ?? 5]}`}
                >
                  <span className="text-2xl font-bold">{patient.esiLevel ?? '—'}</span>
                  <span className="text-sm font-medium opacity-90">ESI</span>
                </div>
                {/* Orientation Badge */}
                {patient.finalOrientation && (
                  <div>
                    <Badge variant="outline" className="text-sm bg-white">
                      {orientationLabels[patient.finalOrientation] || patient.finalOrientation}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Alerts */}
            {patient.allergies && (
              <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Allergies: {patient.allergies}
              </div>
            )}

            {/* Scores */}
            <div className="mt-4 pt-3 border-t border-blue-200 flex gap-6">
              <div>
                <span className="text-sm text-gray-500">NEWS:</span>
                <span
                  className={`ml-2 font-semibold ${
                    (patient.newsScore ?? 0) >= 7
                      ? 'text-red-600'
                      : (patient.newsScore ?? 0) >= 5
                        ? 'text-orange-600'
                        : 'text-green-600'
                  }`}
                >
                  {patient.newsScore ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500">GCS:</span>
                <span
                  className={`ml-2 font-semibold ${(patient.gcsScore ?? 15) < 12 ? 'text-red-600' : ''}`}
                >
                  {patient.gcsScore ?? '—'}/15
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500">qSOFA:</span>
                <span
                  className={`ml-2 font-semibold ${(patient.qsofaScore ?? 0) >= 2 ? 'text-red-600' : ''}`}
                >
                  {patient.qsofaScore ?? '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Show All Boxes Toggle */}
        {patient?.finalOrientation && (
          <div className="mb-4 flex items-center justify-end">
            <Button
              variant={showAllBoxes ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAllBoxes(!showAllBoxes)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {showAllBoxes ? 'Afficher les boxes recommandés' : 'Afficher tous les boxes'}
            </Button>
          </div>
        )}

        {/* Recommended Boxes Section */}
        {recommendedBoxes.length > 0 && !showAllBoxes && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BedDouble className="h-5 w-5 text-green-500" />
                Boxes Recommandés
                <Badge variant="secondary" className="ml-2">
                  {orientationLabels[patient.finalOrientation || ''] || 'Standard'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {recommendedBoxes.map((box) => renderBoxCard(box, true))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Other Boxes Section - shown when showAllBoxes is true or no recommended boxes */}
        {((otherBoxes.length > 0 && !showAllBoxes) || (showAllBoxes && boxes.length > 0)) && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BedDouble className="h-5 w-5 text-gray-400" />
                {showAllBoxes ? 'Tous les Boxes' : 'Autres Boxes Disponibles'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(showAllBoxes ? boxes : otherBoxes).map((box) => renderBoxCard(box, false))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* No boxes available */}
        {boxes.length === 0 && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <BedDouble className="h-12 w-12 text-yellow-500 mx-auto mb-3" />
                <p className="text-yellow-700 font-medium">Aucun box disponible</p>
                <p className="text-sm text-yellow-600 mt-1">
                  Vous pouvez tout de même prendre en charge le patient sans assignation de box.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/nurse/treatment')}
            disabled={submitting}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            variant="outline"
            onClick={() => handleStartTreatment()}
            disabled={submitting}
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            {submitting ? 'En cours...' : 'Prendre en charge sans box'}
          </Button>
          <Button
            onClick={() => handleStartTreatment(selectedBoxId || undefined)}
            disabled={submitting || !selectedBoxId}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-2" />
            {submitting ? 'En cours...' : 'Confirmer avec box sélectionné'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
