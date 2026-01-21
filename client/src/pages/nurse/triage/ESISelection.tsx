import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lightbulb, Activity, Brain } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Sex } from '@ncdss/shared';
import { suggestESI } from '../../../utils/scoreUtils';

interface ESILevel {
  level: number;
  title: string;
  description: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

const ESI_LEVELS: ESILevel[] = [
  {
    level: 1,
    title: 'Réanimation immédiate',
    description: 'Intervention vitale immédiate requise',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
    textColor: 'text-red-900',
  },
  {
    level: 2,
    title: 'Urgence vitale',
    description: 'Situation à haut risque, confusion, léthargie, douleur sévère',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
    textColor: 'text-orange-900',
  },
  {
    level: 3,
    title: 'Urgent',
    description: 'Nécessite plusieurs ressources',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-500',
    textColor: 'text-yellow-900',
  },
  {
    level: 4,
    title: 'Moins urgent',
    description: 'Nécessite une ressource',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-500',
    textColor: 'text-green-900',
  },
  {
    level: 5,
    title: 'Non urgent',
    description: 'Aucune ressource nécessaire',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-900',
  },
];

export default function ESISelection() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedESI, setSelectedESI] = useState<number | null>(null);
  const [suggestedESI, setSuggestedESI] = useState<number | null>(null);

  // Load patient data
  useEffect(() => {
    const loadPatient = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();
        const response = await api.get(`/patients/${id}`);
        const patientData: Patient = response.data;
        setPatient(patientData);

        // Calculate suggested ESI
        const suggested = suggestESI({
          newsScore: patientData.newsScore,
          gcsScore: patientData.gcsScore,
          qsofaScore: patientData.qsofaScore,
          painLevel: patientData.painLevel,
        });
        setSuggestedESI(suggested);

        // Pre-select suggested ESI if patient doesn't have ESI yet
        if (!patientData.esiLevel) {
          setSelectedESI(suggested);
        } else {
          setSelectedESI(patientData.esiLevel);
        }
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de chargement du patient');
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  const handleContinue = () => {
    if (!selectedESI || !id) return;
    navigate(`/nurse/triage/${id}/orientation`, {
      state: {
        esiLevel: selectedESI,
      },
    });
  };

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
            <h1 className="text-2xl font-bold">Sélection du Niveau ESI</h1>
            <p className="text-sm text-gray-600">Étape 6/6 - Index de Sévérité d'Urgence</p>
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

        {/* Score Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Résumé des Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-600">NEWS:</span>
                <Badge
                  variant={
                    (patient.newsScore ?? 0) >= 7
                      ? 'destructive'
                      : (patient.newsScore ?? 0) >= 5
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {patient.newsScore ?? '—'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-gray-600" />
                <span className="text-sm text-gray-600">GCS:</span>
                <Badge
                  variant={
                    (patient.gcsScore ?? 15) < 9
                      ? 'destructive'
                      : (patient.gcsScore ?? 15) < 13
                      ? 'default'
                      : 'secondary'
                  }
                >
                  {patient.gcsScore ?? '—'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">qSOFA:</span>
                <Badge variant={(patient.qsofaScore ?? 0) >= 2 ? 'destructive' : 'secondary'}>
                  {patient.qsofaScore ?? '—'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Douleur:</span>
                <Badge variant={(patient.painLevel ?? 0) >= 7 ? 'destructive' : 'secondary'}>
                  {patient.painLevel ?? '—'}/10
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ESI Suggestion */}
        {suggestedESI && (
          <Alert className="mb-6 border-blue-500 bg-blue-50">
            <Lightbulb className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              Niveau ESI suggéré basé sur les scores: <strong>ESI {suggestedESI}</strong>
            </AlertDescription>
          </Alert>
        )}

        {/* ESI Level Cards */}
        <div className="space-y-4 mb-6">
          {ESI_LEVELS.map((esi) => (
            <Card
              key={esi.level}
              className={`cursor-pointer transition-all border-2 ${
                selectedESI === esi.level
                  ? `${esi.bgColor} ${esi.borderColor} shadow-md`
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${
                suggestedESI === esi.level && selectedESI !== esi.level
                  ? 'ring-2 ring-blue-300'
                  : ''
              }`}
              onClick={() => setSelectedESI(esi.level)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className={`flex items-center gap-3 ${esi.textColor}`}>
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full ${esi.bgColor} ${esi.borderColor} border-2`}
                    >
                      <span className="text-lg font-bold">{esi.level}</span>
                    </div>
                    <span>{esi.title}</span>
                  </CardTitle>
                  {selectedESI === esi.level && (
                    <Badge className="bg-green-600">Sélectionné</Badge>
                  )}
                  {suggestedESI === esi.level && selectedESI !== esi.level && (
                    <Badge variant="outline" className="border-blue-500 text-blue-600">
                      Suggéré
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className={selectedESI === esi.level ? esi.textColor : ''}>
                  {esi.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Button
            onClick={handleContinue}
            disabled={selectedESI === null}
            className="min-w-[150px]"
          >
            Continuer
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
