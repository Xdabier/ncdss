import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Edit, Trash2, Search, FileText, AlertTriangle } from 'lucide-react';
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
import { PathologyModal, Pathology } from '../../components/admin/PathologyModal';

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
  PEDIATRIC: 'Pédiatrie',
};

const orientationColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  SAUV: 'destructive',
  MEDICAL: 'info',
  SURGICAL: 'warning',
  TRAUMA: 'secondary',
  PEDIATRIC: 'success',
};

const ITEMS_PER_PAGE = 20;

export default function PathologyList() {
  const navigate = useNavigate();
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [filteredPathologies, setFilteredPathologies] = useState<Pathology[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [orientationFilter, setOrientationFilter] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [orientations, setOrientations] = useState<string[]>([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPathology, setSelectedPathology] = useState<Pathology | null>(null);

  // Delete confirmation states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pathologyToDelete, setPathologyToDelete] = useState<Pathology | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const loadPathologies = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
      if (orientationFilter && orientationFilter !== 'all') params.append('orientation', orientationFilter);

      const response = await api.get(`/pathologies?${params.toString()}`);
      setPathologies(response.data);
    } catch (error) {
      console.error('Error loading pathologies:', error);
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, orientationFilter]);

  const loadFilterOptions = async () => {
    try {
      const api = await getApi();
      const [categoriesRes, orientationsRes] = await Promise.all([
        api.get('/pathologies/categories'),
        api.get('/pathologies/orientations'),
      ]);
      setCategories(categoriesRes.data.filter(Boolean));
      setOrientations(orientationsRes.data.filter(Boolean));
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  useEffect(() => {
    loadPathologies();
  }, [loadPathologies]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  // Client-side filtering for immediate response
  useEffect(() => {
    let filtered = [...pathologies];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchLower) ||
          p.category?.toLowerCase().includes(searchLower)
      );
    }

    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter((p) => p.category?.includes(categoryFilter));
    }

    if (orientationFilter && orientationFilter !== 'all') {
      filtered = filtered.filter((p) => p.primaryOrientation === orientationFilter);
    }

    setFilteredPathologies(filtered);
    setCurrentPage(1);
  }, [pathologies, search, categoryFilter, orientationFilter]);

  const handleOpenCreate = () => {
    setSelectedPathology(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (pathology: Pathology) => {
    setSelectedPathology(pathology);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedPathology(null);
  };

  const handleSave = () => {
    loadPathologies();
    loadFilterOptions();
  };

  const handleOpenDelete = (pathology: Pathology) => {
    setPathologyToDelete(pathology);
    setDeleteConfirmOpen(true);
  };

  const handleCloseDelete = () => {
    setDeleteConfirmOpen(false);
    setPathologyToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!pathologyToDelete) return;

    setIsDeleting(true);
    try {
      const api = await getApi();
      await api.delete(`/pathologies/${pathologyToDelete.id}`);
      loadPathologies();
      loadFilterOptions();
      handleCloseDelete();
    } catch (error) {
      console.error('Error deleting pathology:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Pagination
  const totalPages = Math.ceil(filteredPathologies.length / ITEMS_PER_PAGE);
  const paginatedPathologies = filteredPathologies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestion des Motifs de Consultation</h1>
            <p className="text-gray-600 mt-1">
              Total: {filteredPathologies.length} motif{filteredPathologies.length !== 1 ? 's' : ''}
              {filteredPathologies.length !== pathologies.length && ` (sur ${pathologies.length})`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/pathologies/import')}>
              <Upload className="h-4 w-4 mr-2" />
              Importer Excel
            </Button>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher par nom..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrer par catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les catégories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={orientationFilter} onValueChange={setOrientationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrer par orientation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les orientations</SelectItem>
                    {orientations.map((o) => (
                      <SelectItem key={o} value={o}>
                        {orientationLabels[o] || o}
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
              <FileText className="h-5 w-5" />
              Liste des Motifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-500">Chargement...</p>
              </div>
            ) : filteredPathologies.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Aucun motif de consultation trouvé</p>
                {(search || categoryFilter !== 'all' || orientationFilter !== 'all') && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch('');
                      setCategoryFilter('all');
                      setOrientationFilter('all');
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nom
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Catégorie
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Orientation primaire
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Orientation secondaire
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedPathologies.map((pathology) => (
                        <tr key={pathology.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900">{pathology.name}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-600">{pathology.category}</div>
                          </td>
                          <td className="px-4 py-4">
                            {pathology.primaryOrientation && (
                              <Badge variant={orientationColors[pathology.primaryOrientation] || 'default'}>
                                {orientationLabels[pathology.primaryOrientation] || pathology.primaryOrientation}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {pathology.secondaryOrientation && (
                              <Badge variant={orientationColors[pathology.secondaryOrientation] || 'outline'}>
                                {orientationLabels[pathology.secondaryOrientation] || pathology.secondaryOrientation}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(pathology)}
                                title="Modifier"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDelete(pathology)}
                                title="Supprimer"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
      <PathologyModal
        open={modalOpen}
        onClose={handleCloseModal}
        pathology={selectedPathology}
        onSave={handleSave}
        existingCategories={categories}
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
                Voulez-vous vraiment supprimer le motif{' '}
                <span className="font-semibold">"{pathologyToDelete?.name}"</span> ?
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
