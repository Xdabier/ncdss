import React, { useState, useEffect, useCallback } from 'react';
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
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Shield,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Filter,
  X,
} from 'lucide-react';
import { getApi } from '../../services/api';

interface AuditEntry {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: any;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  fullName: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  // CRUD operations
  CREATE: { label: 'Création', variant: 'default' },
  VIEW: { label: 'Consultation', variant: 'outline' },
  UPDATE: { label: 'Modification', variant: 'secondary' },
  DELETE: { label: 'Suppression', variant: 'destructive' },
  IMPORT: { label: 'Import', variant: 'default' },

  // Legacy HTTP methods (fallback)
  POST: { label: 'Création', variant: 'default' },
  PUT: { label: 'Modification', variant: 'secondary' },
  GET: { label: 'Consultation', variant: 'outline' },

  // Authentication
  LOGIN_SUCCESS: { label: 'Connexion', variant: 'default' },
  LOGIN_FAILED: { label: 'Échec connexion', variant: 'destructive' },
  LOGOUT: { label: 'Déconnexion', variant: 'secondary' },

  // Triage workflow
  TRIAGE_START_TRIAGE: { label: 'Début triage', variant: 'default' },
  TRIAGE_COMPLETE_TRIAGE: { label: 'Fin triage', variant: 'default' },
  TRIAGE_ANALYZE: { label: 'Analyse clinique', variant: 'secondary' },
  TRIAGE_RETRIAGE: { label: 'Re-triage', variant: 'secondary' },
  SET_ESI: { label: 'Définir ESI', variant: 'secondary' },

  // ABCDE Assessment
  ASSESS_ABCDE: { label: 'Éval. ABCDE', variant: 'secondary' },
  ASSESS_AIRWAY: { label: 'Éval. Airway', variant: 'secondary' },
  ASSESS_BREATHING: { label: 'Éval. Breathing', variant: 'secondary' },
  ASSESS_CIRCULATION: { label: 'Éval. Circulation', variant: 'secondary' },
  ASSESS_DISABILITY: { label: 'Éval. Disability', variant: 'secondary' },
  ASSESS_EXPOSURE: { label: 'Éval. Exposure', variant: 'secondary' },

  // Vitals & Treatment
  UPDATE_VITALS: { label: 'Màj constantes', variant: 'secondary' },
  UPDATE_TREATMENT: { label: 'Màj traitement', variant: 'secondary' },
  ASSIGN_BOX: { label: 'Affectation box', variant: 'default' },
  DISCHARGE: { label: 'Sortie patient', variant: 'default' },

  // Prescriptions
  PRESCRIPTION_ADMINISTER: { label: 'Administration', variant: 'default' },
  PRESCRIPTION_CANCEL: { label: 'Annulation Rx', variant: 'destructive' },
  PRESCRIPTION_HOLD: { label: 'Suspension Rx', variant: 'secondary' },

  // Diagnoses
  DIAGNOSIS_CONFIRM: { label: 'Confirmation Dx', variant: 'default' },
  DIAGNOSIS_RESOLVE: { label: 'Résolution Dx', variant: 'default' },

  // User management
  RESET_PASSWORD: { label: 'Réinit. MDP', variant: 'secondary' },
};

const RESOURCE_LABELS: Record<string, string> = {
  patients: 'Patients',
  prescriptions: 'Prescriptions',
  diagnoses: 'Diagnostics',
  users: 'Utilisateurs',
  auth: 'Authentification',
  config: 'Configuration',
  schedule: 'Planning',
  pathologies: 'Pathologies',
  interventions: 'Interventions',
  'box-assignments': 'Affectations boxes',
  sync: 'Synchronisation',
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, limit: 50, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  // Filters (use '__all__' as special value for "all" since Radix doesn't allow empty string)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userId, setUserId] = useState('__all__');
  const [action, setAction] = useState('__all__');
  const [resource, setResource] = useState('__all__');
  const [showFilters, setShowFilters] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const api = await getApi();
      const response = await api.get('/audit-log/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  const fetchEntries = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const api = await getApi();
      const params: Record<string, string> = {
        limit: '50',
        offset: offset.toString(),
      };

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userId && userId !== '__all__') params.userId = userId;
      if (action && action !== '__all__') params.action = action;
      if (resource && resource !== '__all__') params.resource = resource;

      const response = await api.get('/audit-log', { params });
      setEntries(response.data.entries);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error fetching audit log:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userId, action, resource]);

  useEffect(() => {
    fetchUsers();
    fetchEntries();
  }, [fetchUsers, fetchEntries]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const api = await getApi();
      const params: Record<string, string> = {};

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userId && userId !== '__all__') params.userId = userId;
      if (action && action !== '__all__') params.action = action;
      if (resource && resource !== '__all__') params.resource = resource;

      const response = await api.get('/audit-log/export', {
        params,
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_log_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting audit log:', error);
    } finally {
      setExporting(false);
    }
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, pagination.offset - pagination.limit);
    fetchEntries(newOffset);
  };

  const handleNextPage = () => {
    const newOffset = pagination.offset + pagination.limit;
    if (newOffset < pagination.total) {
      fetchEntries(newOffset);
    }
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setUserId('__all__');
    setAction('__all__');
    setResource('__all__');
  };

  const hasActiveFilters = startDate || endDate || (userId && userId !== '__all__') || (action && action !== '__all__') || (resource && resource !== '__all__');

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <DashboardLayout>
      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-blue-600" />
                  Journal d'Audit
                </CardTitle>
                <CardDescription>
                  Historique des actions effectuées sur les données sensibles
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={hasActiveFilters ? 'border-blue-500 text-blue-600' : ''}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  Filtres
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      Actifs
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchEntries(pagination.offset)}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Exporter CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            {showFilters && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Filtres</h3>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      Effacer
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="startDate">Date début</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Date fin</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="userId">Utilisateur</Label>
                    <Select value={userId} onValueChange={setUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Tous</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.fullName} ({user.username})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="action">Action</Label>
                    <Select value={action} onValueChange={setAction}>
                      <SelectTrigger>
                        <SelectValue placeholder="Toutes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Toutes</SelectItem>
                        <SelectItem value="AUTH">Authentification</SelectItem>
                        <SelectItem value="CREATE">Création</SelectItem>
                        <SelectItem value="VIEW">Consultation</SelectItem>
                        <SelectItem value="UPDATE">Modification</SelectItem>
                        <SelectItem value="DELETE">Suppression</SelectItem>
                        <SelectItem value="TRIAGE">Triage</SelectItem>
                        <SelectItem value="DISCHARGE">Sortie</SelectItem>
                        <SelectItem value="IMPORT">Import</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="resource">Ressource</Label>
                    <Select value={resource} onValueChange={setResource}>
                      <SelectTrigger>
                        <SelectValue placeholder="Toutes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Toutes</SelectItem>
                        <SelectItem value="auth">Authentification</SelectItem>
                        <SelectItem value="patients">Patients</SelectItem>
                        <SelectItem value="prescriptions">Prescriptions</SelectItem>
                        <SelectItem value="diagnoses">Diagnostics</SelectItem>
                        <SelectItem value="users">Utilisateurs</SelectItem>
                        <SelectItem value="config">Configuration</SelectItem>
                        <SelectItem value="schedule">Planning</SelectItem>
                        <SelectItem value="pathologies">Pathologies</SelectItem>
                        <SelectItem value="interventions">Interventions</SelectItem>
                        <SelectItem value="box-assignments">Affectations boxes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => fetchEntries(0)}>
                    Appliquer les filtres
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                Aucune entrée dans le journal d'audit
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-[180px]">Date/Heure</TableHead>
                        <TableHead>Utilisateur</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Ressource</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead className="w-[80px]">Détails</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-sm">
                            {formatDateTime(entry.createdAt)}
                          </TableCell>
                          <TableCell>{entry.username}</TableCell>
                          <TableCell>
                            <Badge variant={ACTION_LABELS[entry.action]?.variant || 'default'}>
                              {ACTION_LABELS[entry.action]?.label || entry.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {RESOURCE_LABELS[entry.resource] || entry.resource}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-gray-500">
                            {entry.resourceId
                              ? entry.resourceId.substring(0, 8) + '...'
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedEntry(entry)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-500">
                    Affichage de {pagination.offset + 1} à{' '}
                    {Math.min(pagination.offset + pagination.limit, pagination.total)} sur{' '}
                    {pagination.total} entrées
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={pagination.offset === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={pagination.offset + pagination.limit >= pagination.total}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détails de l'entrée</DialogTitle>
            <DialogDescription>
              Informations complètes sur cette action
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">Date/Heure</Label>
                  <p className="font-mono">{formatDateTime(selectedEntry.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Utilisateur</Label>
                  <p>{selectedEntry.username}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Action</Label>
                  <Badge variant={ACTION_LABELS[selectedEntry.action]?.variant || 'default'}>
                    {ACTION_LABELS[selectedEntry.action]?.label || selectedEntry.action}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-500">Ressource</Label>
                  <p>{RESOURCE_LABELS[selectedEntry.resource] || selectedEntry.resource}</p>
                </div>
                <div>
                  <Label className="text-gray-500">ID Ressource</Label>
                  <p className="font-mono text-sm">{selectedEntry.resourceId || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Adresse IP</Label>
                  <p className="font-mono">{selectedEntry.ipAddress || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-gray-500">User Agent</Label>
                <p className="text-sm text-gray-600 break-all">
                  {selectedEntry.userAgent || '-'}
                </p>
              </div>
              <div>
                <Label className="text-gray-500">Données</Label>
                <pre className="mt-1 p-3 bg-gray-50 rounded-md text-sm overflow-auto max-h-64">
                  {selectedEntry.details
                    ? JSON.stringify(selectedEntry.details, null, 2)
                    : 'Aucune donnée'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
