import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Stethoscope,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Syringe,
  RefreshCw,
} from 'lucide-react';
import { getApi } from '../../services/api';
import { hashString } from '../../utils/hashUtils';
import { API_ROUTES, MedicalIntervention, NursingIntervention } from '@ncdss/shared';

// ============================================================================
// Types
// ============================================================================

interface InterventionItem {
  key: string;
  label: string;
  isSurgical?: boolean;
  priority: number;
}

// ============================================================================
// localStorage helpers
// ============================================================================

const STORAGE_PREFIX = 'ncdss:interventions:';

function getCheckedMap(patientId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + patientId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistCheckedMap(patientId: string, map: Record<string, boolean>): void {
  localStorage.setItem(STORAGE_PREFIX + patientId, JSON.stringify(map));
}

function interventionKey(text: string): string {
  return hashString(text.trim());
}

// ============================================================================
// Section sub-component
// ============================================================================

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  items: InterventionItem[];
  checkedMap: Record<string, boolean>;
  onToggle: (key: string) => void;
}

function InterventionSection({ title, icon, accentColor, items, checkedMap, onToggle }: SectionProps) {
  const [open, setOpen] = useState(true);
  const doneCount = items.filter((i) => checkedMap[i.key]).length;

  if (items.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900 mb-1"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="text-[10px] ml-1">
            {doneCount}/{items.length}
          </Badge>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-1 ml-1">
          {items.map((item) => {
            const checked = !!checkedMap[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'bg-gray-50 border-gray-200'
                    : `${accentColor} border-opacity-60`
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.key)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <span
                  className={`text-sm leading-snug ${
                    checked ? 'line-through text-gray-400' : 'text-gray-800'
                  }`}
                >
                  {item.label}
                </span>
                <span className="flex items-center gap-1 ml-auto shrink-0">
                  {item.isSurgical && (
                    <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">
                      Chirurgical
                    </Badge>
                  )}
                  {item.priority <= 2 && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      Prioritaire
                    </Badge>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface SuggestedInterventionsCardProps {
  patientId: string;
}

export function SuggestedInterventionsCard({ patientId }: SuggestedInterventionsCardProps) {
  const [nursingItems, setNursingItems] = useState<InterventionItem[]>([]);
  const [medicalItems, setMedicalItems] = useState<InterventionItem[]>([]);
  const [checkedMap, setCheckedMapState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(false);

  const loadInterventions = useCallback(async () => {
    try {
      const api = await getApi();

      // 1) Try LLM unified analysis first - this is the primary source
      try {
        const uRes = await api.get(API_ROUTES.patients.unifiedAnalysis(patientId));
        const uData = uRes.data;
        if (uData?.exists && uData.status === 'completed' && uData.result) {
          const nArr: string[] = uData.result.nursingInterventions || [];
          const mArr: string[] = uData.result.medicalInterventions || [];
          if (nArr.length > 0 || mArr.length > 0) {
            setNursingItems(nArr.map((text: string, i: number) => ({
              key: interventionKey(text),
              label: text,
              priority: i + 1,
            })));
            setMedicalItems(mArr.map((text: string, i: number) => ({
              key: interventionKey(text),
              label: text,
              priority: i + 1,
            })));
            setFound(true);
            return;
          }
        }
      } catch {
        // unified analysis may not exist - fall through
      }

      // 2) Fallback: rule-based analysis
      try {
        const rRes = await api.get(API_ROUTES.patients.analysis(patientId));
        const rData = rRes.data;
        const nArr = rData?.suggestedNursingInterventions || [];
        const mArr = rData?.suggestedMedicalInterventions || [];
        if (rData?.hasAnalysis && (nArr.length > 0 || mArr.length > 0)) {
          setNursingItems(nArr.map((n: NursingIntervention) => ({
            key: interventionKey(n.descriptionFr),
            label: n.descriptionFr,
            priority: n.priorityOrder ?? 99,
          })));
          setMedicalItems(mArr.map((m: MedicalIntervention) => ({
            key: interventionKey(m.descriptionFr),
            label: m.descriptionFr,
            isSurgical: m.isSurgical,
            priority: m.priorityOrder ?? 99,
          })));
          setFound(true);
          return;
        }
      } catch {
        // rule-based analysis may not exist - fall through
      }

      setFound(false);
    } catch {
      setFound(false);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadInterventions();
    setCheckedMapState(getCheckedMap(patientId));
  }, [loadInterventions, patientId]);

  const handleToggle = (key: string): void => {
    setCheckedMapState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistCheckedMap(patientId, next);
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (!found || (nursingItems.length === 0 && medicalItems.length === 0)) {
    return null;
  }

  const totalDone =
    nursingItems.filter((i) => checkedMap[i.key]).length +
    medicalItems.filter((i) => checkedMap[i.key]).length;
  const totalAll = nursingItems.length + medicalItems.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-indigo-500" />
            Interventions suggérées
            <Badge variant="secondary" className="text-xs ml-1">
              {totalDone}/{totalAll}
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <InterventionSection
          title="Soins infirmiers"
          icon={<HeartPulse className="h-4 w-4 text-green-600" />}
          accentColor="bg-green-50 border-green-200"
          items={nursingItems}
          checkedMap={checkedMap}
          onToggle={handleToggle}
        />
        <InterventionSection
          title="Interventions médicales"
          icon={<Syringe className="h-4 w-4 text-blue-600" />}
          accentColor="bg-blue-50 border-blue-200"
          items={medicalItems}
          checkedMap={checkedMap}
          onToggle={handleToggle}
        />
      </CardContent>
    </Card>
  );
}
