import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { ABCDEReviewComponent } from '../../components/doctor/ABCDEReview';
import { getApi } from '../../services/api';
import { Patient, Sex, API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

// ESI colors
const esiColors: Record<number, string> = {
  1: 'bg-red-600 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-white',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

export default function ABCDEReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatient = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.byId(id));
      setPatient(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement du patient');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Patient non trouvé</h2>
              <p className="text-gray-600">{error || 'Le patient demandé n\'existe pas.'}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Parse allergies
  const allergies = patient.allergies ? patient.allergies.split(',').map(a => a.trim()).filter(Boolean) : [];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center items-start gap-2 justify-between mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate(CLIENT_ROUTES.doctor.patientDetail(id!))}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour au dossier
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">{patient.fullName}</h1>
              <p className="text-gray-600">
                {patient.age} ans, {patient.sex === Sex.MALE ? 'Homme' : 'Femme'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {patient.esiLevel && (
              <div className={`px-4 py-2 rounded-lg ${esiColors[patient.esiLevel]}`}>
                <span className="text-xl font-bold">ESI {patient.esiLevel}</span>
              </div>
            )}
            {patient.finalOrientation && (
              <Badge variant="outline" className="text-sm py-1.5">
                {patient.finalOrientation}
              </Badge>
            )}
            <Button onClick={loadPatient} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <Alert variant="destructive" className="mb-4 sm:mb-6 md:mb-8">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Allergies :</span>{' '}
              {allergies.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Chief Complaint */}
        {patient.chiefComplaint && (
          <Card className="mb-4 sm:mb-6 md:mb-8">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500 mb-1">Motif de consultation</p>
              <p className="font-medium">{patient.chiefComplaint}</p>
            </CardContent>
          </Card>
        )}

        {/* ABCDE Review Component */}
        <ABCDEReviewComponent patient={patient} />
      </div>
    </DashboardLayout>
  );
}
