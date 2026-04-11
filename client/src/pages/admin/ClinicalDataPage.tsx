import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Search,
  Stethoscope,
  ChevronDown,
  ChevronRight,
  Syringe,
  Pill,
  Activity,
  Heart,
  Database,
  Scissors,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { getApi } from '../../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';

interface PathologyListItem {
  pathologyId: string;
  icd10Code: string;
  abcdeCategory: string;
  nameFr: string;
  nameEn?: string;
  triagePriority: string;
  departmentCodes?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface PathologyDetail extends PathologyListItem {
  symptoms: Symptom[];
  nursingInterventions: NursingIntervention[];
  medicalInterventions: MedicalIntervention[];
}

interface Symptom {
  id: number;
  symptomCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  isVitalSign: boolean | number;
  vitalOperator?: string | null;
  vitalValue?: number | null;
  vitalUnit?: string | null;
}

interface NursingIntervention {
  id: number;
  interventionCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  priorityOrder: number;
}

interface MedicalIntervention {
  id: number;
  interventionCode: string;
  descriptionFr: string;
  descriptionEn?: string;
  isSurgical: boolean | number;
  priorityOrder: number;
}

interface ClinicalStats {
  pathologies: number;
  symptoms: number;
  uniqueSymptomCodes: number;
  nursingInterventions: number;
  medicalInterventions: number;
  byCategory: Record<string, number>;
}

const triagePriorityLabels: Record<string, string> = {
  SAUV: 'SAUV',
  DECHOCAGE: 'Déchocage',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
  PEDIATRIC: 'Pédiatrie',
};

const triagePriorityColors: Record<string, string> = {
  SAUV: 'bg-red-100 text-red-800 border-red-200',
  DECHOCAGE: 'bg-rose-100 text-rose-800 border-rose-200',
  MEDICAL: 'bg-blue-100 text-blue-800 border-blue-200',
  SURGICAL: 'bg-amber-100 text-amber-800 border-amber-200',
  TRAUMA: 'bg-orange-100 text-orange-800 border-orange-200',
  PEDIATRIC: 'bg-green-100 text-green-800 border-green-200',
};

const abcdeCategoryLabels: Record<string, string> = {
  A: 'A - Airway',
  B: 'B - Breathing',
  C: 'C - Circulation',
  D: 'D - Disability',
  E: 'E - Exposure',
};

const abcdeCategoryColors: Record<string, string> = {
  A: 'bg-red-100 text-red-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-purple-100 text-purple-800',
  E: 'bg-green-100 text-green-800',
};

const CATEGORY_TABS = [
  { value: 'all', label: 'Tous' },
  { value: 'A', label: 'A (Airway)' },
  { value: 'B', label: 'B (Breathing)' },
  { value: 'C', label: 'C (Circulation)' },
  { value: 'D', label: 'D (Disability)' },
  { value: 'E', label: 'E (Exposure)' },
];

const TRIAGE_PRIORITIES = [
  { value: 'all', label: 'Toutes les priorités' },
  { value: 'SAUV', label: 'SAUV' },
  { value: 'DECHOCAGE', label: 'Déchocage' },
  { value: 'SURGICAL', label: 'Chirurgical' },
  { value: 'TRAUMA', label: 'Trauma' },
  { value: 'MEDICAL', label: 'Médical' },
  { value: 'PEDIATRIC', label: 'Pédiatrie' },
];

const ITEMS_PER_PAGE = 20;

export default function ClinicalDataPage(): React.ReactElement {
  const navigate = useNavigate();

  // Data
  const [pathologies, setPathologies] = useState<PathologyListItem[]>([]);
  const [stats, setStats] = useState<ClinicalStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Expanded rows - stores pathologyId -> detail data
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedDetails, setExpandedDetails] = useState<Record<string, PathologyDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const loadStats = useCallback(async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.clinicalData.stats);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  const loadPathologies = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const params: Record<string, string> = { limit: '500' };
      if (search) params.search = search;
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (priorityFilter !== 'all') params.triagePriority = priorityFilter;

      const response = await api.get(API_ROUTES.clinicalData.pathologies.list, { params });
      setPathologies(response.data);
    } catch (error) {
      console.error('Error loading pathologies:', error);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, priorityFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadPathologies();
  }, [loadPathologies]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedRows(new Set());
  }, [search, categoryFilter, priorityFilter]);

  const toggleRowExpanded = async (pathologyId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(pathologyId)) {
        next.delete(pathologyId);
      } else {
        next.add(pathologyId);
      }
      return next;
    });

    // Load detail if not already loaded
    if (!expandedDetails[pathologyId] && !loadingDetails.has(pathologyId)) {
      setLoadingDetails((prev) => new Set(prev).add(pathologyId));
      try {
        const api = await getApi();
        const response = await api.get(API_ROUTES.clinicalData.pathologies.get(pathologyId));
        setExpandedDetails((prev) => ({ ...prev, [pathologyId]: response.data }));
      } catch (error) {
        console.error('Error loading pathology detail:', error);
      } finally {
        setLoadingDetails((prev) => {
          const next = new Set(prev);
          next.delete(pathologyId);
          return next;
        });
      }
    }
  };

  // Pagination
  const totalPages = Math.ceil(pathologies.length / ITEMS_PER_PAGE);
  const paginatedPathologies = pathologies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Données Cliniques</h1>
            <p className="text-gray-600 mt-1">
              Gestion des pathologies, symptômes et interventions ABCDE
            </p>
          </div>
          <Button onClick={() => navigate(CLIENT_ROUTES.admin.clinicalDataImport)}>
            <Upload className="h-4 w-4 mr-2" />
            Importer Excel
          </Button>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Database className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.pathologies}</p>
                    <p className="text-xs text-gray-500">Pathologies</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Activity className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.uniqueSymptomCodes}</p>
                    <p className="text-xs text-gray-500">Symptômes uniques</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-50 rounded-lg">
                    <Syringe className="h-5 w-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.nursingInterventions}</p>
                    <p className="text-xs text-gray-500">Int. infirmières</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Pill className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.medicalInterventions}</p>
                    <p className="text-xs text-gray-500">Int. médicales</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Heart className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.symptoms}</p>
                    <p className="text-xs text-gray-500">Symptômes (total)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Category Breakdown */}
        {stats?.byCategory && (
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORY_TABS.map((tab) => {
              if (tab.value === 'all') return null;
              const count = stats.byCategory[tab.value] || 0;
              return (
                <button
                  key={tab.value}
                  onClick={() => setCategoryFilter(tab.value === categoryFilter ? 'all' : tab.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    categoryFilter === tab.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
                    {count}
                  </span>
                </button>
              );
            })}
            {categoryFilter !== 'all' && (
              <button
                onClick={() => setCategoryFilter('all')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100"
              >
                Tous
              </button>
            )}
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom, code ICD-10 ou ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Priorité de triage" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIAGE_PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Pathologies
              <span className="text-sm font-normal text-gray-500">
                ({pathologies.length} résultat{pathologies.length !== 1 ? 's' : ''})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Chargement...</p>
              </div>
            ) : pathologies.length === 0 ? (
              <div className="text-center py-12">
                <Stethoscope className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Aucune pathologie trouvée</p>
                {(search || categoryFilter !== 'all' || priorityFilter !== 'all') && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch('');
                      setCategoryFilter('all');
                      setPriorityFilter('all');
                    }}
                  >
                    Effacer les filtres
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8" />
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nom (Fr)
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                          Catégorie
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priorité
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ICD-10
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPathologies.map((pathology) => {
                        const isExpanded = expandedRows.has(pathology.pathologyId);
                        const detail = expandedDetails[pathology.pathologyId];
                        const isLoadingDetail = loadingDetails.has(pathology.pathologyId);

                        return (
                          <React.Fragment key={pathology.pathologyId}>
                            <tr
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleRowExpanded(pathology.pathologyId)}
                            >
                              <td className="px-4 py-4">
                                <button className="p-1 hover:bg-gray-200 rounded">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-sm font-mono text-gray-600">
                                  {pathology.pathologyId}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-sm font-medium text-gray-900">
                                  {pathology.nameFr}
                                </span>
                              </td>
                              <td className="px-4 py-4 hidden sm:table-cell">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    abcdeCategoryColors[pathology.abcdeCategory] || 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {abcdeCategoryLabels[pathology.abcdeCategory] || pathology.abcdeCategory}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium border ${
                                    triagePriorityColors[pathology.triagePriority] || 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {triagePriorityLabels[pathology.triagePriority] || pathology.triagePriority}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-sm text-gray-500 font-mono">
                                  {pathology.icd10Code}
                                </span>
                              </td>
                            </tr>

                            {/* Expanded Detail Row */}
                            {isExpanded && (
                              <tr className="bg-gray-50">
                                <td colSpan={6} className="px-4 py-4">
                                  {isLoadingDetail ? (
                                    <p className="text-sm text-gray-500 text-center py-4">Chargement des détails...</p>
                                  ) : detail ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                      {/* Symptoms */}
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                          <Activity className="h-4 w-4 text-amber-500" />
                                          Symptômes ({detail.symptoms.length})
                                        </h4>
                                        {detail.symptoms.length > 0 ? (
                                          <ul className="space-y-1.5">
                                            {detail.symptoms.map((s) => (
                                              <li key={s.id} className="text-sm text-gray-600 flex items-start gap-2">
                                                <span className="text-amber-500 mt-0.5">
                                                  {s.isVitalSign ? (
                                                    <Activity className="h-3.5 w-3.5" />
                                                  ) : (
                                                    <span>&#8226;</span>
                                                  )}
                                                </span>
                                                <span>
                                                  <span className="font-mono text-xs text-gray-400 mr-1">{s.symptomCode}</span>
                                                  {s.descriptionFr}
                                                  {s.isVitalSign && s.vitalOperator && (
                                                    <Badge variant="outline" className="ml-1 text-xs px-1 py-0">
                                                      {s.vitalOperator} {s.vitalValue} {s.vitalUnit}
                                                    </Badge>
                                                  )}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        ) : (
                                          <p className="text-sm text-gray-400 italic">Aucun symptôme</p>
                                        )}
                                      </div>

                                      {/* Nursing Interventions */}
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                          <Syringe className="h-4 w-4 text-cyan-500" />
                                          Interventions infirmières ({detail.nursingInterventions.length})
                                        </h4>
                                        {detail.nursingInterventions.length > 0 ? (
                                          <ol className="space-y-1.5">
                                            {detail.nursingInterventions
                                              .sort((a, b) => a.priorityOrder - b.priorityOrder)
                                              .map((ni) => (
                                                <li key={ni.id} className="text-sm text-gray-600 flex items-start gap-2">
                                                  <span className="text-cyan-600 font-medium min-w-[1.2rem]">
                                                    {ni.priorityOrder}.
                                                  </span>
                                                  {ni.descriptionFr}
                                                </li>
                                              ))}
                                          </ol>
                                        ) : (
                                          <p className="text-sm text-gray-400 italic">Aucune intervention</p>
                                        )}
                                      </div>

                                      {/* Medical Interventions */}
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                          <Pill className="h-4 w-4 text-purple-500" />
                                          Interventions médicales ({detail.medicalInterventions.length})
                                        </h4>
                                        {detail.medicalInterventions.length > 0 ? (
                                          <ol className="space-y-1.5">
                                            {detail.medicalInterventions
                                              .sort((a, b) => a.priorityOrder - b.priorityOrder)
                                              .map((mi) => (
                                                <li key={mi.id} className="text-sm text-gray-600 flex items-start gap-2">
                                                  <span className="text-purple-600 font-medium min-w-[1.2rem]">
                                                    {mi.priorityOrder}.
                                                  </span>
                                                  <span>
                                                    {mi.descriptionFr}
                                                    {mi.isSurgical ? (
                                                      <Badge variant="outline" className="ml-1 text-xs px-1 py-0 border-amber-300 text-amber-700">
                                                        <Scissors className="h-3 w-3 mr-0.5" />
                                                        Chirurgical
                                                      </Badge>
                                                    ) : null}
                                                  </span>
                                                </li>
                                              ))}
                                          </ol>
                                        ) : (
                                          <p className="text-sm text-gray-400 italic">Aucune intervention</p>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-400 text-center py-4">
                                      Impossible de charger les détails
                                    </p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      Page {currentPage} sur {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Précédent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Suivant
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
