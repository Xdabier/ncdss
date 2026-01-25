import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleGuard } from './components/guards/RoleGuard';
import { UserRole } from '@ncdss/shared';

// Auth & General
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Help from './pages/Help';

// Admin pages
import ERConfiguration from './pages/admin/ERConfiguration';
import UserManagement from './pages/admin/UserManagement';
import UserForm from './pages/admin/UserForm';
import ResetPassword from './pages/admin/ResetPassword';
import BoxManagement from './pages/admin/BoxManagement';
import BoxAssignments from './pages/admin/BoxAssignments';
import PathologyList from './pages/admin/PathologyList';
import PathologyForm from './pages/admin/PathologyForm';
import PathologyImport from './pages/admin/PathologyImport';
import InterventionsList from './pages/admin/InterventionsList';
import InterventionForm from './pages/admin/InterventionForm';
import InterventionsImport from './pages/admin/InterventionsImport';
import AuditLog from './pages/admin/AuditLog';
import BackupManagement from './pages/admin/BackupManagement';

// Supervisor pages
import WeeklySchedule from './pages/supervisor/WeeklySchedule';
import DepartmentStats from './pages/supervisor/DepartmentStats';
import QueueManagement from './pages/supervisor/QueueManagement';
import AllPatients from './pages/supervisor/AllPatients';
import SupervisorPatientDetail from './pages/supervisor/PatientDetail';

// Nurse pages
import InscriptionHome from './pages/nurse/InscriptionHome';
import PatientRegistration from './pages/nurse/PatientRegistration';
import PatientEdit from './pages/nurse/PatientEdit';
import TriageQueue from './pages/nurse/triage/TriageQueue';
import ABCDEAssessment from './pages/nurse/triage/ABCDEAssessment';
import SuggestionsReview from './pages/nurse/triage/SuggestionsReview';
// VitalsEntry removed - vitals are now collected in ABCDE forms
import ScoreReview from './pages/nurse/triage/ScoreReview';
import ESISelection from './pages/nurse/triage/ESISelection';
import Orientation from './pages/nurse/triage/Orientation';
import PatientSummary from './pages/nurse/triage/PatientSummary';
import TreatmentQueue from './pages/nurse/treatment/TreatmentQueue';
import PatientCare from './pages/nurse/treatment/PatientCare';
import VitalsUpdate from './pages/nurse/treatment/VitalsUpdate';
import AssignBox from './pages/nurse/treatment/AssignBox';
import ReTriageRequest from './pages/nurse/treatment/ReTriageRequest';
import DeteriorationAlert from './pages/nurse/treatment/DeteriorationAlert';

// Doctor pages
import MyPatients from './pages/doctor/MyPatients';
import PatientDetail from './pages/doctor/PatientDetail';
import PatientHistory from './pages/doctor/PatientHistory';
import ABCDEReview from './pages/doctor/ABCDEReview';
import AIPreDiagnosis from './pages/doctor/AIPreDiagnosis';
import DiagnosisEntry from './pages/doctor/DiagnosisEntry';
import ECGReview from './pages/doctor/ECGReview';

// Shared pages
import PatientSearch from './pages/shared/PatientSearch';
import PatientTimeline from './pages/shared/PatientTimeline';
import PathologyLookup from './pages/shared/PathologyLookup';
import InterventionsLookup from './pages/shared/InterventionsLookup';

export default function App() {
  const { loadAuth } = useAuthStore();

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* General routes (all authenticated users) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin/er-config"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ERConfiguration />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/new"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:id/edit"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:id/reset-password"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ResetPassword />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/boxes"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <BoxManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/box-assignments"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <BoxAssignments />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pathologies"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <PathologyList />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pathologies/import"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <PathologyImport />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/pathologies/:id"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <PathologyForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/interventions"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <InterventionsList />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/interventions/:id"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <InterventionForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/interventions/import"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <InterventionsImport />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <AuditLog />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/backup"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <BackupManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Supervisor routes */}
        <Route
          path="/supervisor/schedule"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <WeeklySchedule />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/stats"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <DepartmentStats />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/queue"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <QueueManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/patients"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <AllPatients />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/patients/:id"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <SupervisorPatientDetail />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Nurse - Inscription routes */}
        <Route
          path="/nurse/inscription"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <InscriptionHome />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/inscription/register"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <PatientRegistration />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/inscription/edit/:id"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <PatientEdit />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Nurse - Triage routes */}
        <Route
          path="/nurse/triage"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <TriageQueue />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/triage/:id/abcde"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <ABCDEAssessment />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        {/* Legacy vitals route - redirect to ABCDE */}
        <Route
          path="/nurse/triage/:id/vitals"
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path="/nurse/triage/:id/suggestions"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <SuggestionsReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/triage/:id/score"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <ScoreReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/triage/:id/esi"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <ESISelection />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/triage/:id/orientation"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <Orientation />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/triage/:id/summary"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <PatientSummary />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Nurse - Treatment routes */}
        <Route
          path="/nurse/treatment"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <TreatmentQueue />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/treatment/:id"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <PatientCare />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/treatment/:id/vitals"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <VitalsUpdate />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/treatment/:id/assign-box"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <AssignBox />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/treatment/:id/retriage"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <ReTriageRequest />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/nurse/treatment/:id/alert"
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <DeteriorationAlert />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Doctor routes */}
        <Route
          path="/doctor/patients"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <MyPatients />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <PatientDetail />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id/history"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <PatientHistory />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id/abcde"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <ABCDEReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id/ai-diagnosis"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <AIPreDiagnosis />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id/diagnosis"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <DiagnosisEntry />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor/patients/:id/ecg"
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <ECGReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Shared routes (all authenticated users) */}
        <Route
          path="/patients/search"
          element={
            <ProtectedRoute>
              <PatientSearch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/:id"
          element={
            <ProtectedRoute>
              <PatientDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patients/:id/timeline"
          element={
            <ProtectedRoute>
              <PatientTimeline />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lookup/pathologies"
          element={
            <ProtectedRoute>
              <PathologyLookup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lookup/interventions"
          element={
            <ProtectedRoute>
              <InterventionsLookup />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
