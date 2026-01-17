import React from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuthStore } from '../stores/auth.store';
import { Activity, Users, Calendar, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const { user, todayAssignment } = useAuthStore();

  const stats = [
    { name: 'Patients en attente', value: '12', icon: Users, color: 'text-blue-600' },
    { name: 'Boxes occupés', value: '8/15', icon: Activity, color: 'text-green-600' },
    { name: 'Taux d\'occupation', value: '53%', icon: TrendingUp, color: 'text-purple-600' },
    { name: 'Temps d\'attente moyen', value: '45 min', icon: Calendar, color: 'text-orange-600' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600 mt-2">
            Bienvenue, {user?.fullName}
            {todayAssignment && ` - Affectation: ${todayAssignment}`}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.name}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {stat.name}
                  </CardTitle>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Welcome Card */}
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue sur NCDSS</CardTitle>
            <CardDescription>
              Système de Support Décisionnel Clinique pour les Infirmiers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              Utilisez le menu de navigation à gauche pour accéder aux différentes fonctionnalités du système.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
