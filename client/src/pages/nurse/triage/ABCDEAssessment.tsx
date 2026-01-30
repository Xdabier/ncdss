import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { AirwayForm } from '../../../components/abcde/AirwayForm';
import { BreathingForm } from '../../../components/abcde/BreathingForm';
import { CirculationForm } from '../../../components/abcde/CirculationForm';
import { DisabilityForm } from '../../../components/abcde/DisabilityForm';
import { ExposureForm } from '../../../components/abcde/ExposureForm';
import { getApi } from '../../../services/api';
import { Patient, API_ROUTES } from '@ncdss/shared';
import { cn } from '../../../lib/utils';

const categories = ['A', 'B', 'C', 'D', 'E'] as const;
type Category = typeof categories[number];

const categoryLabels: Record<Category, string> = {
  A: 'Airway',
  B: 'Breathing',
  C: 'Circulation',
  D: 'Disability',
  E: 'Exposure'
};

const categoryColors: Record<Category, string> = {
  A: 'bg-red-100 text-red-800 border-red-200',
  B: 'bg-orange-100 text-orange-800 border-orange-200',
  C: 'bg-blue-100 text-blue-800 border-blue-200',
  D: 'bg-purple-100 text-purple-800 border-purple-200',
  E: 'bg-green-100 text-green-800 border-green-200'
};

export default function ABCDEAssessment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [currentCategory, setCurrentCategory] = useState<Category>('A');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Local state for forms
  const [abcdeData, setAbcdeData] = useState<any>({});
  
  // Track completion
  const [completed, setCompleted] = useState<Record<Category, boolean>>({
    A: false, B: false, C: false, D: false, E: false
  });

  useEffect(() => {
    loadPatient();
  }, [id]);

  const loadPatient = async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.byId(id!));
      const p = response.data;
      setPatient(p);
      
      // Initialize forms with existing data
      setAbcdeData({
        A: p.abcdeAirway ? JSON.parse(p.abcdeAirway) : {},
        B: p.abcdeBreathing ? JSON.parse(p.abcdeBreathing) : {},
        C: p.abcdeCirculation ? JSON.parse(p.abcdeCirculation) : {},
        D: p.abcdeDisability ? JSON.parse(p.abcdeDisability) : {},
        E: p.abcdeExposure ? JSON.parse(p.abcdeExposure) : {}
      });

      setCompleted({
        A: !!p.abcdeAirway,
        B: !!p.abcdeBreathing,
        C: !!p.abcdeCirculation,
        D: !!p.abcdeDisability,
        E: !!p.abcdeExposure
      });
    } catch (e) {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateData = (category: Category, data: any) => {
    setAbcdeData((prev: any) => ({
      ...prev,
      [category]: data
    }));
  };

  const saveCategory = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const api = await getApi();
      const data = abcdeData[currentCategory];
      
      await api.put(API_ROUTES.patients.abcde(id, currentCategory), data);
      
      setCompleted(prev => ({ ...prev, [currentCategory]: true }));
      
      // Auto-advance
      const currentIndex = categories.indexOf(currentCategory);
      if (currentIndex < categories.length - 1) {
        setCurrentCategory(categories[currentIndex + 1]);
      } else {
        // Finished E - navigate to Suggestions Review for clinical decision support
        navigate(`/nurse/triage/${id}/suggestions`);
      }
      
      await loadPatient(); // Refresh data
    } catch (e) {
      setError('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="p-6">Chargement...</div></DashboardLayout>;
  }

  if (!patient) {
    return <DashboardLayout><div className="p-6">Patient non trouvé</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/nurse/triage')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{patient.fullName}</h1>
              <p className="text-sm text-gray-600">Étape 1/5 - Évaluation ABCDE</p>
              <p className="text-gray-500 text-sm">
                {patient.age} ans, {patient.sex === 'MALE' ? 'Homme' : 'Femme'} • {patient.chiefComplaint}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(`/nurse/triage/${id}/suggestions`)}
            className="hidden md:flex"
          >
            Voir les Suggestions <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <div className="flex w-full mb-6 bg-white p-1 rounded-lg shadow-sm overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCurrentCategory(cat)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 px-4 rounded-md transition-all min-w-[80px]",
                currentCategory === cat 
                  ? "bg-blue-600 text-white shadow-md" 
                  : "hover:bg-gray-50 text-gray-600"
              )}
            >
              <span className="font-bold text-lg mb-1">{cat}</span>
              <span className="text-xs uppercase hidden md:block opacity-90">{categoryLabels[cat]}</span>
              {completed[cat] && (
                <CheckCircle className={cn(
                  "h-4 w-4 mt-1",
                  currentCategory === cat ? "text-blue-200" : "text-green-500"
                )} />
              )}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <Card className="border-t-4 border-t-blue-600">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="outline" className={cn("text-lg px-3 py-1 border-2", categoryColors[currentCategory])}>
                {currentCategory} - {categoryLabels[currentCategory]}
              </Badge>
            </div>

            {currentCategory === 'A' && (
              <AirwayForm 
                data={abcdeData.A} 
                onChange={d => handleUpdateData('A', d)} 
                onSave={saveCategory}
                loading={saving}
              />
            )}
            {currentCategory === 'B' && (
              <BreathingForm 
                data={abcdeData.B} 
                onChange={d => handleUpdateData('B', d)} 
                onSave={saveCategory}
                loading={saving}
              />
            )}
            {currentCategory === 'C' && (
              <CirculationForm 
                data={abcdeData.C} 
                onChange={d => handleUpdateData('C', d)} 
                onSave={saveCategory}
                loading={saving}
              />
            )}
            {currentCategory === 'D' && (
              <DisabilityForm 
                data={abcdeData.D} 
                onChange={d => handleUpdateData('D', d)} 
                onSave={saveCategory}
                loading={saving}
              />
            )}
            {currentCategory === 'E' && (
              <ExposureForm 
                data={abcdeData.E} 
                onChange={d => handleUpdateData('E', d)} 
                onSave={saveCategory}
                loading={saving}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
