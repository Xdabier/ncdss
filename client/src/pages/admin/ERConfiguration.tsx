import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { getApi } from '../../services/api';
import { ERConfiguration, API_ROUTES } from '@ncdss/shared';

export default function ERConfigurationPage() {
  const [config, setConfig] = useState<ERConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.config.er);
      setConfig(response.data);
    } catch {
      setError('Erreur de chargement de la configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const api = await getApi();
      await api.put(API_ROUTES.config.er, config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ERConfiguration, value: number) => {
    if (config) {
      setConfig({ ...config, [field]: value });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Chargement de la configuration...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Configuration des Urgences</h1>
            <p className="text-gray-600 mt-2">
              Paramétrez la capacité et l'organisation de votre service d'urgences
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-6 bg-green-50 text-green-800 border-green-200">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Configuration sauvegardée avec succès!</AlertDescription>
            </Alert>
          )}

          {/* Configuration Form */}
          {config && (
            <div className="space-y-6">
              {/* Accueil & Triage */}
              <Card>
                <CardHeader>
                  <CardTitle>Accueil & Triage</CardTitle>
                  <CardDescription>Configuration des postes d'accueil et de triage</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="inscriptionDesks">Postes d'Inscription</Label>
                      <Input
                        id="inscriptionDesks"
                        type="number"
                        min="1"
                        max="10"
                        value={config.inscriptionDesks}
                        onChange={(e) =>
                          updateField('inscriptionDesks', parseInt(e.target.value) || 1)
                        }
                      />
                      <p className="text-sm text-gray-500">
                        Nombre de postes d'inscription des patients
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="triageBoxes">Boxes de Triage</Label>
                      <Input
                        id="triageBoxes"
                        type="number"
                        min="1"
                        max="10"
                        value={config.triageBoxes}
                        onChange={(e) => updateField('triageBoxes', parseInt(e.target.value) || 1)}
                      />
                      <p className="text-sm text-gray-500">Boxes dédiés au tri des patients</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="medicalBoxes">Boxes de Soins</Label>
                      <Input
                        id="medicalBoxes"
                        type="number"
                        min="1"
                        max="20"
                        value={config.medicalBoxes}
                        onChange={(e) => updateField('medicalBoxes', parseInt(e.target.value) || 1)}
                      />
                      <p className="text-sm text-gray-500">Boxes pour médecine générale</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Boxes de Soins */}
              <Card>
                <CardHeader>
                  <CardTitle>Zones de Prise en Charge</CardTitle>
                  <CardDescription>
                    Configuration des zones de prise en charge spécialisée
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="surgicalBoxes">Boxes Chirurgicaux</Label>
                      <Input
                        id="surgicalBoxes"
                        type="number"
                        min="1"
                        max="20"
                        value={config.surgicalBoxes}
                        onChange={(e) =>
                          updateField('surgicalBoxes', parseInt(e.target.value) || 1)
                        }
                      />
                      <p className="text-sm text-gray-500">Boxes pour chirurgie</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="traumaBoxes">Boxes Traumatologie</Label>
                      <Input
                        id="traumaBoxes"
                        type="number"
                        min="1"
                        max="10"
                        value={config.traumaBoxes}
                        onChange={(e) => updateField('traumaBoxes', parseInt(e.target.value) || 1)}
                      />
                      <p className="text-sm text-gray-500">Boxes pour traumatologie</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sauvBeds">Boxes SAUV</Label>
                      <Input
                        id="sauvBeds"
                        type="number"
                        min="1"
                        max="10"
                        value={config.sauvBeds}
                        onChange={(e) => updateField('sauvBeds', parseInt(e.target.value) || 1)}
                      />
                      <p className="text-sm text-gray-500">Boxes de la Salle d'Accueil des Urgences Vitales</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dechocageBeds">Boxes Déchocage</Label>
                      <Input
                        id="dechocageBeds"
                        type="number"
                        min="1"
                        max="10"
                        value={config.dechocageBeds}
                        onChange={(e) => updateField('dechocageBeds', parseInt(e.target.value) || 1)}
                      />
                      <p className="text-sm text-gray-500">Boxes de la Salle de Déchocage</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-blue-900">Capacité Totale</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {config.inscriptionDesks +
                      config.triageBoxes +
                      config.medicalBoxes +
                      config.surgicalBoxes +
                      config.traumaBoxes +
                      config.sauvBeds +
                      config.dechocageBeds}{' '}
                    postes
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    Capacité totale du service d'urgences
                  </p>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} size="lg">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
