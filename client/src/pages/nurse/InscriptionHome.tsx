import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../components/ui/DataTable';
import { SearchInput } from '../../components/ui/SearchInput';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { getApi } from '../../services/api';
import { CLIENT_ROUTES } from '../../routes';
import { Patient, PatientStatus, API_ROUTES } from '@ncdss/shared';
import { formatDateTime } from '../../utils/dateUtils';

const statusLabels: Record<string, string> = {
  REGISTERED: 'En attente',
  IN_TRIAGE: 'En triage',
  TRIAGED: 'Triagé',
  IN_TREATMENT: 'En soins',
  WITH_DOCTOR: 'Avec médecin',
  DISCHARGED: 'Sorti'
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  REGISTERED: 'destructive',
  IN_TRIAGE: 'default',
  TRIAGED: 'outline',
  IN_TREATMENT: 'secondary',
  WITH_DOCTOR: 'secondary',
  DISCHARGED: 'outline'
};

export default function InscriptionHome() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      const api = await getApi();
      const params: Record<string, string> = {};
      if (search) params.search = search;

      const response = await api.get(API_ROUTES.patients.list, { params });
      setPatients(response.data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const columns: Column<Patient>[] = [
    {
      key: 'fullName',
      header: 'Patient',
      width: '30%',
      render: (p) => (
        <div>
          <div className="font-medium">{p.fullName}</div>
          <div className="text-sm text-gray-500">{p.age} ans, {p.sex === 'MALE' ? 'H' : 'F'}</div>
        </div>
      )
    },
    {
      key: 'chiefComplaint',
      header: 'Motif',
      width: '25%',
      render: (p) => p.chiefComplaint || <span className="text-gray-400">-</span>
    },
    {
      key: 'status',
      header: 'Statut',
      width: '20%',
      render: (p) => (
        <Badge variant={statusColors[p.status]}>
          {statusLabels[p.status]}
        </Badge>
      )
    },
    {
      key: 'createdAt',
      header: 'Heure',
      width: '15%',
      hiddenOnMobile: true,
      render: (p) => formatDateTime(p.createdAt).split(' ')[1]
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '10%',
      render: (p) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              navigate(CLIENT_ROUTES.shared.patientDetail(p.id));
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  // Stats
  const stats = {
    total: patients.length,
    waiting: patients.filter(p => p.status === PatientStatus.REGISTERED).length,
    inTriage: patients.filter(p => p.status === PatientStatus.IN_TRIAGE).length
  };

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 md:p-6">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4 sm:mb-6">Inscription des Patients</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-500">Aujourd'hui</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.waiting}</div>
              <div className="text-sm text-gray-500">En attente</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.inTriage}</div>
              <div className="text-sm text-gray-500">En triage</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Action */}
        <div className="flex justify-between items-center mb-4 gap-4">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un patient..."
            />
          </div>
          <Button onClick={() => navigate(CLIENT_ROUTES.nurse.inscription.register)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Patient
          </Button>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={patients}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage="Aucun patient inscrit aujourd'hui"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
