import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Patient } from '@ncdss/shared';
import {
  ChevronDown,
  ChevronUp,
  Wind,
  Activity,
  Heart,
  Brain,
  Thermometer,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface ABCDEReviewProps {
  patient: Patient;
}

interface ParsedABCDE {
  findings?: string[];
  interventions?: string[];
  notes?: string;
  patent?: boolean;
  obstructed?: boolean;
  secretions?: boolean;
  stridor?: boolean;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  breathSounds?: string;
  workOfBreathing?: string;
  cyanosis?: boolean;
  heartRate?: number;
  bloodPressure?: string;
  capillaryRefill?: number;
  skinColor?: string;
  peripheralPulses?: string;
  bleeding?: boolean;
  gcsEye?: number;
  gcsVerbal?: number;
  gcsMotor?: number;
  pupils?: string;
  motorResponse?: string;
  glucoseLevel?: number;
  temperature?: number;
  rash?: boolean;
  wounds?: boolean;
  edema?: boolean;
}

function parseJSON<T>(jsonStr: string | undefined): T | null {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

// French labels for clinical values
const breathSoundsLabels: Record<string, string> = {
  'normal': 'Normaux',
  'decreased': 'Diminués',
  'wheezing': 'Sibilants',
  'crackles': 'Crépitants',
};

const workOfBreathingLabels: Record<string, string> = {
  'normal': 'Normal',
  'increased': 'Augmenté',
  'severe': 'Sévère',
};

const skinColorLabels: Record<string, string> = {
  'normal': 'Normal',
  'pale': 'Pâle',
  'cyanotic': 'Cyanosé',
  'mottled': 'Marbré',
};

const peripheralPulsesLabels: Record<string, string> = {
  'strong': 'Forts',
  'weak': 'Faibles',
  'absent': 'Absents',
};

const pupilsLabels: Record<string, string> = {
  'PEARL': 'PEARL (Normales)',
  'unequal': 'Inégales',
  'dilated': 'Dilatées',
  'constricted': 'Constrictées',
};

const motorResponseLabels: Record<string, string> = {
  'normal': 'Normal',
  'weakness': 'Faiblesse',
  'paralysis': 'Paralysie',
};

interface ABCDESectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  data: ParsedABCDE | null;
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  hasCritical?: boolean;
}

function ABCDESection({ title, icon, iconColor, data, category, hasCritical }: ABCDESectionProps) {
  const [isOpen, setIsOpen] = useState(hasCritical || false);

  const renderContent = () => {
    if (!data) {
      return (
        <p className="text-gray-500 italic text-sm">Aucune donnée enregistrée</p>
      );
    }

    switch (category) {
      case 'A':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {data.patent !== undefined && (
                <Badge variant={data.patent ? 'success' : 'destructive'}>
                  {data.patent ? 'Voies aériennes libres' : 'Voies aériennes obstruées'}
                </Badge>
              )}
              {data.obstructed && (
                <Badge variant="destructive">Obstruction</Badge>
              )}
              {data.secretions && (
                <Badge variant="warning">Sécrétions</Badge>
              )}
              {data.stridor && (
                <Badge variant="destructive">Stridor</Badge>
              )}
            </div>
            {data.interventions && data.interventions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Interventions :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.interventions.map((int, i) => (
                    <li key={i}>{int}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notes :</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>
            )}
          </div>
        );

      case 'B':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 text-sm">
              {data.respiratoryRate !== undefined && (
                <div>
                  <span className="text-gray-500">FR :</span>{' '}
                  <span className={data.respiratoryRate < 12 || data.respiratoryRate > 20 ? 'text-red-600 font-semibold' : ''}>
                    {data.respiratoryRate} /min
                  </span>
                </div>
              )}
              {data.oxygenSaturation !== undefined && (
                <div>
                  <span className="text-gray-500">SpO2 :</span>{' '}
                  <span className={data.oxygenSaturation < 94 ? 'text-red-600 font-semibold' : ''}>
                    {data.oxygenSaturation}%
                  </span>
                </div>
              )}
              {data.breathSounds && (
                <div>
                  <span className="text-gray-500">Bruits respiratoires :</span>{' '}
                  <span className={data.breathSounds !== 'normal' ? 'text-amber-600 font-medium' : ''}>
                    {breathSoundsLabels[data.breathSounds] || data.breathSounds}
                  </span>
                </div>
              )}
              {data.workOfBreathing && (
                <div>
                  <span className="text-gray-500">Travail respiratoire :</span>{' '}
                  <span className={data.workOfBreathing !== 'normal' ? 'text-amber-600 font-medium' : ''}>
                    {workOfBreathingLabels[data.workOfBreathing] || data.workOfBreathing}
                  </span>
                </div>
              )}
            </div>
            {data.cyanosis && (
              <Badge variant="destructive">Cyanose présente</Badge>
            )}
            {data.interventions && data.interventions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Interventions :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.interventions.map((int, i) => (
                    <li key={i}>{int}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notes :</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>
            )}
          </div>
        );

      case 'C':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 text-sm">
              {data.heartRate !== undefined && (
                <div>
                  <span className="text-gray-500">FC :</span>{' '}
                  <span className={data.heartRate < 60 || data.heartRate > 100 ? 'text-amber-600 font-medium' : ''}>
                    {data.heartRate} bpm
                  </span>
                </div>
              )}
              {data.bloodPressure && (
                <div>
                  <span className="text-gray-500">TA :</span>{' '}
                  <span>{data.bloodPressure} mmHg</span>
                </div>
              )}
              {data.capillaryRefill !== undefined && (
                <div>
                  <span className="text-gray-500">TRC :</span>{' '}
                  <span className={data.capillaryRefill > 2 ? 'text-amber-600 font-medium' : ''}>
                    {data.capillaryRefill}s
                  </span>
                </div>
              )}
              {data.skinColor && (
                <div>
                  <span className="text-gray-500">Coloration :</span>{' '}
                  <span className={data.skinColor !== 'normal' ? 'text-amber-600 font-medium' : ''}>
                    {skinColorLabels[data.skinColor] || data.skinColor}
                  </span>
                </div>
              )}
              {data.peripheralPulses && (
                <div>
                  <span className="text-gray-500">Pouls périphériques :</span>{' '}
                  <span className={data.peripheralPulses !== 'strong' ? 'text-amber-600 font-medium' : ''}>
                    {peripheralPulsesLabels[data.peripheralPulses] || data.peripheralPulses}
                  </span>
                </div>
              )}
            </div>
            {data.bleeding && (
              <Badge variant="destructive">Saignement actif</Badge>
            )}
            {data.interventions && data.interventions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Interventions :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.interventions.map((int, i) => (
                    <li key={i}>{int}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notes :</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>
            )}
          </div>
        );

      case 'D':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 text-sm">
              {(data.gcsEye !== undefined || data.gcsVerbal !== undefined || data.gcsMotor !== undefined) && (
                <div className="col-span-2">
                  <span className="text-gray-500">GCS :</span>{' '}
                  <span>
                    E{data.gcsEye || '-'} V{data.gcsVerbal || '-'} M{data.gcsMotor || '-'}
                    {(data.gcsEye && data.gcsVerbal && data.gcsMotor) && (
                      <span className={
                        (data.gcsEye + data.gcsVerbal + data.gcsMotor) < 9
                          ? 'text-red-600 font-semibold ml-2'
                          : (data.gcsEye + data.gcsVerbal + data.gcsMotor) < 13
                            ? 'text-amber-600 font-medium ml-2'
                            : 'ml-2'
                      }>
                        (Total: {data.gcsEye + data.gcsVerbal + data.gcsMotor})
                      </span>
                    )}
                  </span>
                </div>
              )}
              {data.pupils && (
                <div>
                  <span className="text-gray-500">Pupilles :</span>{' '}
                  <span className={data.pupils !== 'PEARL' ? 'text-amber-600 font-medium' : ''}>
                    {pupilsLabels[data.pupils] || data.pupils}
                  </span>
                </div>
              )}
              {data.motorResponse && (
                <div>
                  <span className="text-gray-500">Réponse motrice :</span>{' '}
                  <span className={data.motorResponse !== 'normal' ? 'text-amber-600 font-medium' : ''}>
                    {motorResponseLabels[data.motorResponse] || data.motorResponse}
                  </span>
                </div>
              )}
              {data.glucoseLevel !== undefined && (
                <div>
                  <span className="text-gray-500">Glycémie :</span>{' '}
                  <span className={data.glucoseLevel < 70 || data.glucoseLevel > 180 ? 'text-amber-600 font-medium' : ''}>
                    {data.glucoseLevel} mg/dL
                  </span>
                </div>
              )}
            </div>
            {data.interventions && data.interventions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Interventions :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.interventions.map((int, i) => (
                    <li key={i}>{int}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notes :</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>
            )}
          </div>
        );

      case 'E':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 text-sm">
              {data.temperature !== undefined && (
                <div>
                  <span className="text-gray-500">Température :</span>{' '}
                  <span className={data.temperature < 36 || data.temperature > 38.5 ? 'text-amber-600 font-medium' : ''}>
                    {data.temperature}°C
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.rash && <Badge variant="warning">Rash cutané</Badge>}
              {data.wounds && <Badge variant="warning">Plaies</Badge>}
              {data.edema && <Badge variant="warning">Oedème</Badge>}
            </div>
            {data.findings && data.findings.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Constatations :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.findings.map((finding, i) => (
                    <li key={i}>{finding}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.interventions && data.interventions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Interventions :</p>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                  {data.interventions.map((int, i) => (
                    <li key={i}>{int}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.notes && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notes :</p>
                <p className="text-sm text-gray-600">{data.notes}</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`border rounded-lg ${hasCritical ? 'border-red-300 bg-red-50/50' : 'border-gray-200'}`}>
      <button
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            {icon}
          </div>
          <span className="font-medium text-gray-900">{title}</span>
          {hasCritical && (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          {data && !hasCritical && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          {renderContent()}
        </div>
      )}
    </div>
  );
}

export function ABCDEReviewComponent({ patient }: ABCDEReviewProps) {
  const airwayData = parseJSON<ParsedABCDE>(patient.abcdeAirway);
  const breathingData = parseJSON<ParsedABCDE>(patient.abcdeBreathing);
  const circulationData = parseJSON<ParsedABCDE>(patient.abcdeCirculation);
  const disabilityData = parseJSON<ParsedABCDE>(patient.abcdeDisability);
  const exposureData = parseJSON<ParsedABCDE>(patient.abcdeExposure);

  // Determine critical sections
  const hasCriticalAirway = !!(airwayData && (airwayData.obstructed || airwayData.stridor || airwayData.patent === false));
  const hasCriticalBreathing = !!(breathingData && (
    breathingData.cyanosis ||
    (breathingData.oxygenSaturation !== undefined && breathingData.oxygenSaturation < 90) ||
    breathingData.workOfBreathing === 'severe'
  ));
  const hasCriticalCirculation = !!(circulationData && (
    circulationData.bleeding ||
    circulationData.skinColor === 'mottled' ||
    circulationData.peripheralPulses === 'absent'
  ));
  const hasCriticalDisability = !!(disabilityData && (
    (disabilityData.gcsEye && disabilityData.gcsVerbal && disabilityData.gcsMotor &&
      (disabilityData.gcsEye + disabilityData.gcsVerbal + disabilityData.gcsMotor) < 9) ||
    disabilityData.pupils === 'unequal' ||
    disabilityData.motorResponse === 'paralysis'
  ));
  const hasCriticalExposure = !!(exposureData && (
    (exposureData.temperature !== undefined && (exposureData.temperature < 35 || exposureData.temperature > 40))
  ));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Évaluation ABCDE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ABCDESection
          title="A - Voies aériennes (Airway)"
          icon={<Wind className="h-5 w-5 text-white" />}
          iconColor="bg-blue-500"
          data={airwayData}
          category="A"
          hasCritical={hasCriticalAirway}
        />
        <ABCDESection
          title="B - Respiration (Breathing)"
          icon={<Activity className="h-5 w-5 text-white" />}
          iconColor="bg-cyan-500"
          data={breathingData}
          category="B"
          hasCritical={hasCriticalBreathing}
        />
        <ABCDESection
          title="C - Circulation"
          icon={<Heart className="h-5 w-5 text-white" />}
          iconColor="bg-red-500"
          data={circulationData}
          category="C"
          hasCritical={hasCriticalCirculation}
        />
        <ABCDESection
          title="D - Neurologie (Disability)"
          icon={<Brain className="h-5 w-5 text-white" />}
          iconColor="bg-purple-500"
          data={disabilityData}
          category="D"
          hasCritical={hasCriticalDisability}
        />
        <ABCDESection
          title="E - Exposition (Exposure)"
          icon={<Thermometer className="h-5 w-5 text-white" />}
          iconColor="bg-orange-500"
          data={exposureData}
          category="E"
          hasCritical={hasCriticalExposure}
        />
      </CardContent>
    </Card>
  );
}
