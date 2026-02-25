import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/badge';
import { getApi } from '../../services/api';
import { Box, BoxType, API_ROUTES } from '@ncdss/shared';
import { cn } from '../../lib/utils';

const boxTypeLabels: Record<string, string> = {
  TRIAGE: 'Triage',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumato',
  SAUV: 'SAUV'
};

const boxTypeColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  TRIAGE: 'outline',
  MEDICAL: 'default',
  SURGICAL: 'secondary',
  TRAUMA: 'destructive',
  SAUV: 'outline'
};

export default function BoxManagement() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadBoxes();
  }, []);

  const loadBoxes = async (): Promise<void> => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.config.boxes);
      setBoxes(response.data);
    } catch (error) {
      console.error('Error loading boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBoxes = filter === 'all'
    ? boxes
    : boxes.filter(b => b.boxType === filter);

  const columns: Column<Box>[] = [
    { key: 'name', header: 'Nom', width: '40%' },
    {
      key: 'boxType',
      header: 'Type',
      width: '30%',
      render: (box) => (
        <Badge variant={boxTypeColors[box.boxType]}>
          {boxTypeLabels[box.boxType]}
        </Badge>
      )
    },
    {
      key: 'isActive',
      header: 'Statut',
      width: '30%',
      render: (box) => (
        <Badge variant={box.isActive ? 'default' : 'secondary'} className={box.isActive ? 'bg-green-500' : ''}>
          {box.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      )
    }
  ];

  // Group boxes by type for summary
  const summary = boxes.reduce((acc, box) => {
    if (box.isActive) {
      acc[box.boxType] = (acc[box.boxType] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-6">Gestion des Boxes</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
          {Object.entries(boxTypeLabels).map(([type, label]) => (
            <div
              key={type}
              className={cn(
                "bg-white rounded-lg shadow p-4 text-center cursor-pointer transition-colors hover:bg-gray-50",
                filter === type && "ring-2 ring-blue-500 bg-blue-50"
              )}
              onClick={() => setFilter(filter === type ? 'all' : type)}
            >
              <div className="text-2xl font-bold">{summary[type] || 0}</div>
              <div className="text-sm text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors",
              filter === 'all'
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            )}
          >
            Tous ({boxes.length})
          </button>
          {Object.entries(boxTypeLabels).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                filter === type
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Note about auto-generation */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <p className="text-sm text-blue-700">
            💡 Les boxes sont générés automatiquement à partir de la <strong>Configuration Urgences</strong>.
            Pour modifier le nombre de boxes, allez dans Configuration Urgences.
          </p>
        </div>

        {/* Boxes Table */}
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={filteredBoxes}
            loading={loading}
            keyExtractor={(box) => box.id}
            emptyMessage="Aucun box trouvé"
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
