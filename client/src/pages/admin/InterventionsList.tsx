import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Upload,
  Edit,
  Trash2,
  Search,
  Stethoscope,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Syringe,
  Pill,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { getApi } from '../../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import { InterventionModal, Intervention } from '../../components/admin/InterventionModal';

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
};

const orientationColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  SAUV: 'destructive',
  MEDICAL: 'info',
  SURGICAL: 'warning',
  TRAUMA: 'secondary',
};

const abcdeCategoryLabels: Record<string, string> = {
  A: 'A - Airway',
  B: 'B - Breathing',
  C: 'C - Circulation',
  D: 'D - Disability',
  E: 'E - Exposure',
  GENERAL: 'Général',
};

const abcdeCategoryColors: Record<string, string> = {
  A: 'bg-red-100 text-red-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-purple-100 text-purple-800',
  E: 'bg-green-100 text-green-800',
  GENERAL: 'bg-gray-100 text-gray-800',
};

const ITEMS_PER_PAGE = 15;

const CATEGORY_TABS = [
  { value: 'all', label: 'Tous' },
  { value: 'A', label: 'A (Airway)' },
  { value: 'B', label: 'B (Breathing)' },
  { value: 'C', label: 'C (Circulation)' },
  { value: 'D', label: 'D (Disability)' },
  { value: 'E', label: 'E (Exposure)' },
  { value: 'GENERAL', label: 'Général' },
];

export default function InterventionsList() {
  const navigate = useNavigate();
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [filteredInterventions, setFilteredInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [interventionToDelete, setInterventionToDelete] = useState<Intervention | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const loadInterventions = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);

      const response = await api.get(API_ROUTES.interventions.list, { params: Object.fromEntries(params) });
      setInterventions(response.data);
    } catch (error) {
      console.error('Error loading interventions:', error);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    loadInterventions();
  }, [loadInterventions]);

  // Client-side filtering for immediate response
  useEffect(() => {
    let filtered = [...interventions];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.pathologyName?.toLowerCase().includes(searchLower) ||
          i.severitySigns?.some((s) => s.toLowerCase().includes(searchLower))
      );
    }

    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter((i) => i.abcdeCategory === categoryFilter);
    }

    setFilteredInterventions(filtered);
    setCurrentPage(1);
    setExpandedRows(new Set());
  }, [interventions, search, categoryFilter]);

  const handleOpenCreate = () => {
    setSelectedIntervention(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (intervention: Intervention) => {
    setSelectedIntervention(intervention);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedIntervention(null);
  };

  const handleSave = () => {
    loadInterventions();
  };

  const handleOpenDelete = (intervention: Intervention) => {
    setInterventionToDelete(intervention);
    setDeleteConfirmOpen(true);
  };

  const handleCloseDelete = () => {
    setDeleteConfirmOpen(false);
    setInterventionToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!interventionToDelete) return;

    setIsDeleting(true);
    try {
      const api = await getApi();
      await api.delete(API_ROUTES.interventions.remove(interventionToDelete.id));
      loadInterventions();
      handleCloseDelete();
    } catch (error) {
      console.error('Error deleting intervention:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleRowExpanded = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Pagination
  const totalPages = Math.ceil(filteredInterventions.length / ITEMS_PER_PAGE);
  const paginatedInterventions = filteredInterventions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Stats
  const stats = {
    total: interventions.length,
    sauv: interventions.filter((i) => i.isSAUV).length,
    byCategory: CATEGORY_TABS.slice(1).map((cat) => ({
      category: cat.value,
      count: interventions.filter((i) => i.abcdeCategory === cat.value).length,
    })),
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Pathologies Cliniques</h1>
            <p className="text-gray-600 mt-1">
              Total: {filteredInterventions.length} pathologie{filteredInterventions.length !== 1 ? 's' : ''}
              {filteredInterventions.length !== interventions.length && ` (sur ${interventions.length})`}
              {stats.sauv > 0 && (
                <span className="ml-2 text-red-600">
                  ({stats.sauv} critique{stats.sauv !== 1 ? 's' : ''})
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(CLIENT_ROUTES.admin.interventionsImport)}>
              <Upload className="h-4 w-4 mr-2" />
              Importer Excel
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Rechercher par nom de pathologie ou signe de gravité..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORY_TABS.map((tab) => {
            const count = tab.value === 'all'
              ? interventions.length
              : interventions.filter((i) => i.abcdeCategory === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setCategoryFilter(tab.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-white/20">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Liste des Pathologies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Chargement...</p>
              </div>
            ) : filteredInterventions.length === 0 ? (
              <div className="text-center py-12">
                <Stethoscope className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Aucune pathologie clinique trouvée</p>
                {(search || categoryFilter !== 'all') && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch('');
                      setCategoryFilter('all');
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                          {/* Expand */}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nom de la pathologie
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Catégorie
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Signes de gravité
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Interventions
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Orientation
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedInterventions.map((intervention) => {
                        const isExpanded = expandedRows.has(intervention.id);
                        return (
                          <React.Fragment key={intervention.id}>
                            {/* Main Row */}
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-4">
                                <button
                                  onClick={() => toggleRowExpanded(intervention.id)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {intervention.pathologyName}
                                  </span>
                                  {intervention.isSAUV && (
                                    <span title="Pathologie critique">
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    abcdeCategoryColors[intervention.abcdeCategory] || 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {abcdeCategoryLabels[intervention.abcdeCategory] || intervention.abcdeCategory}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <div className="text-sm text-gray-600 max-w-xs">
                                  {intervention.severitySigns?.length > 0 ? (
                                    <>
                                      {intervention.severitySigns.slice(0, 2).join(', ')}
                                      {intervention.severitySigns.length > 2 && (
                                        <span className="text-gray-400">
                                          {' '}+{intervention.severitySigns.length - 2}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <div className="flex items-center gap-1 text-blue-600" title="Interventions infirmières">
                                    <Syringe className="h-4 w-4" aria-label="Interventions infirmières" />
                                    <span className="text-sm">{intervention.nursingInterventions?.length || 0}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-purple-600" title="Interventions médicales">
                                    <Pill className="h-4 w-4" aria-label="Interventions médicales" />
                                    <span className="text-sm">{intervention.medicalInterventions?.length || 0}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {intervention.primaryOrientation && (
                                    <Badge variant={orientationColors[intervention.primaryOrientation] || 'default'}>
                                      {orientationLabels[intervention.primaryOrientation] || intervention.primaryOrientation}
                                    </Badge>
                                  )}
                                  {intervention.secondaryOrientation && (
                                    <Badge variant={orientationColors[intervention.secondaryOrientation] || 'outline'}>
                                      {orientationLabels[intervention.secondaryOrientation] || intervention.secondaryOrientation}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEdit(intervention)}
                                    title="Modifier"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenDelete(intervention)}
                                    title="Supprimer"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Row */}
                            {isExpanded && (
                              <tr className="bg-gray-50">
                                <td colSpan={7} className="px-4 py-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Severity Signs */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                        Signes de gravité
                                      </h4>
                                      {intervention.severitySigns?.length > 0 ? (
                                        <ul className="space-y-1">
                                          {intervention.severitySigns.map((sign, idx) => (
                                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                              <span className="text-amber-500 mt-1">•</span>
                                              {sign}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Aucun signe défini</p>
                                      )}
                                    </div>

                                    {/* Nursing Interventions */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Syringe className="h-4 w-4 text-blue-500" />
                                        Interventions infirmières
                                      </h4>
                                      {intervention.nursingInterventions?.length > 0 ? (
                                        <ul className="space-y-1">
                                          {intervention.nursingInterventions.map((int, idx) => (
                                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                              <span className="text-blue-500 mt-1">•</span>
                                              {int}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Aucune intervention définie</p>
                                      )}
                                    </div>

                                    {/* Medical Interventions */}
                                    <div>
                                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Pill className="h-4 w-4 text-purple-500" />
                                        Interventions médicales
                                      </h4>
                                      {intervention.medicalInterventions?.length > 0 ? (
                                        <ul className="space-y-1">
                                          {intervention.medicalInterventions.map((int, idx) => (
                                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                              <span className="text-purple-500 mt-1">•</span>
                                              {int}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-sm text-gray-400 italic">Aucune intervention définie</p>
                                      )}

                                      {/* Dosage Formulas */}
                                      {intervention.dosageFormulas && (
                                        <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                                          <span className="font-medium text-yellow-700">Dosage: </span>
                                          <span className="text-yellow-800">{intervention.dosageFormulas}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
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

      {/* Create/Edit Modal */}
      <InterventionModal
        open={modalOpen}
        onClose={handleCloseModal}
        intervention={selectedIntervention}
        onSave={handleSave}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleCloseDelete} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 z-10">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirmer la suppression</h3>
                  <p className="text-sm text-gray-500">Cette action est irréversible</p>
                </div>
              </div>
              <p className="text-gray-600 mb-6">
                Voulez-vous vraiment supprimer la pathologie{' '}
                <span className="font-semibold">"{interventionToDelete?.pathologyName}"</span> ?
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCloseDelete}
                  disabled={isDeleting}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Suppression...' : 'Supprimer'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
