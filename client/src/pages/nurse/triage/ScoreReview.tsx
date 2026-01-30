import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Activity, Brain, AlertTriangle, Heart } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Sex, API_ROUTES } from '@ncdss/shared';
import { getScoreColor, getScoreLabel } from '../../../utils/scoreUtils';

export default function ScoreReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load patient data
  useEffect(() => {
    const loadPatient = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();
        const response = await api.get(API_ROUTES.patients.byId(id));
        setPatient(response.data);
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de chargement du patient');
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
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
          <div className="max-w-5xl mx-auto">
            <Alert variant="destructive">
              <AlertDescription>Patient non trouvé</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Révision des Scores</h1>
            <p className="text-sm text-gray-600">Étape 2/5 - Scores calculés</p>
          </div>
        </div>

        {/* Patient Header */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Patient</p>
                <p className="font-semibold">{patient.fullName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Âge / Sexe</p>
                <p className="font-semibold">
                  {patient.age} ans / {patient.sex === Sex.MALE ? 'H' : 'F'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Motif</p>
                <p className="font-semibold">{patient.chiefComplaint || 'Non spécifié'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Score Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* NEWS Score */}
          <Card className={`border-2 ${getScoreColor(patient.newsScore || 0, 'news')}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                NEWS Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl font-bold">
                  {patient.newsScore ?? '—'}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Échelle</div>
                  <div className="text-sm font-medium">0-20</div>
                </div>
              </div>
              <Badge className="w-full justify-center py-2">
                {getScoreLabel(patient.newsScore || 0, 'news')}
              </Badge>
              <div className="mt-4 text-sm text-gray-700">
                <p className="font-medium mb-1">Signification:</p>
                <ul className="space-y-1 text-xs">
                  <li>• 0-4: Risque faible</li>
                  <li>• 5-6: Risque moyen</li>
                  <li>• ≥7: Risque élevé</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* GCS Score */}
          <Card className={`border-2 ${getScoreColor(patient.gcsScore || 15, 'gcs')}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Glasgow Coma Scale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl font-bold">
                  {patient.gcsScore ?? '—'}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Échelle</div>
                  <div className="text-sm font-medium">3-15</div>
                </div>
              </div>
              <Badge className="w-full justify-center py-2">
                {getScoreLabel(patient.gcsScore || 15, 'gcs')}
              </Badge>
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Détails:</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-xs text-gray-600">E</div>
                    <div className="font-semibold">{patient.gcsEye || '—'}</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-xs text-gray-600">V</div>
                    <div className="font-semibold">{patient.gcsVerbal || '—'}</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-xs text-gray-600">M</div>
                    <div className="font-semibold">{patient.gcsMotor || '—'}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* qSOFA Score */}
          <Card className={`border-2 ${getScoreColor(patient.qsofaScore || 0, 'qsofa')}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                qSOFA Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl font-bold">
                  {patient.qsofaScore ?? '—'}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Échelle</div>
                  <div className="text-sm font-medium">0-3</div>
                </div>
              </div>
              <Badge className="w-full justify-center py-2">
                {getScoreLabel(patient.qsofaScore || 0, 'qsofa')}
              </Badge>
              <div className="mt-4 text-sm text-gray-700">
                <p className="font-medium mb-1">Signification:</p>
                <ul className="space-y-1 text-xs">
                  <li>• 0: Faible risque sepsis</li>
                  <li>• 1: Risque faible sepsis</li>
                  <li>• ≥2: Risque sepsis</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Pain Level */}
          <Card className={`border-2 ${getScoreColor(patient.painLevel || 0, 'pain')}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Niveau de Douleur
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="text-4xl font-bold">
                  {patient.painLevel ?? '—'}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Échelle</div>
                  <div className="text-sm font-medium">0-10</div>
                </div>
              </div>
              <Badge className="w-full justify-center py-2">
                {getScoreLabel(patient.painLevel || 0, 'pain')}
              </Badge>
              <div className="mt-4 text-sm text-gray-700">
                <p className="font-medium mb-1">Signification:</p>
                <ul className="space-y-1 text-xs">
                  <li>• 0-3: Douleur faible</li>
                  <li>• 4-6: Douleur modérée</li>
                  <li>• ≥7: Douleur sévère</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Button onClick={() => navigate(`/nurse/triage/${id}/complete`)} className="min-w-[150px]">
            Continuer
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
