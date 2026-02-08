import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleGuard } from './components/guards/RoleGuard';
import { UserRole } from '@ncdss/shared';
import { CLIENT_ROUTES } from './routes';

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
import ClinicalDataPage from './pages/admin/ClinicalDataPage';
import ClinicalDataImportPage from './pages/admin/ClinicalDataImportPage';
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
import TriageWorkflow from './pages/nurse/triage/TriageWorkflow';
// TriageComplete functionality absorbed into TriageWorkflow
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
import TrackingBoard from './pages/shared/TrackingBoard';

export default function App() {
  const { loadAuth } = useAuthStore();

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  return (
    <HashRouter>
      <Routes>
        {/* Public routes */}
        <Route path={CLIENT_ROUTES.login} element={<Login />} />

        {/* General routes (all authenticated users) */}
        <Route
          path={CLIENT_ROUTES.dashboard}
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.profile}
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.settings}
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.help}
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path={CLIENT_ROUTES.admin.erConfig}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ERConfiguration />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.users}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.userNew}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.userEdit(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <UserForm />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.userResetPassword(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ResetPassword />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.boxes}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <BoxManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.boxAssignments}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <BoxAssignments />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        {/* Clinical Data (new unified pages) */}
        <Route
          path={CLIENT_ROUTES.admin.clinicalData}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ClinicalDataPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.clinicalDataImport}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <ClinicalDataImportPage />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        {/* Redirects from old pathology/intervention routes */}
        <Route
          path={CLIENT_ROUTES.admin.pathologies}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalData} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.pathologyImport}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalDataImport} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.pathologyDetail(':id')}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalData} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.interventions}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalData} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.interventionDetail(':id')}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalData} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.interventionsImport}
          element={<Navigate to={CLIENT_ROUTES.admin.clinicalDataImport} replace />}
        />
        <Route
          path={CLIENT_ROUTES.admin.audit}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
                <AuditLog />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.admin.backup}
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
          path={CLIENT_ROUTES.supervisor.schedule}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <WeeklySchedule />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.supervisor.stats}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <DepartmentStats />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.supervisor.queue}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <QueueManagement />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.supervisor.patients}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}>
                <AllPatients />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.supervisor.patientDetail(':id')}
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
          path={CLIENT_ROUTES.nurse.inscription.home}
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
          path={CLIENT_ROUTES.nurse.inscription.register}
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
          path={CLIENT_ROUTES.nurse.inscription.edit(':id')}
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
          path={CLIENT_ROUTES.nurse.triage.queue}
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
          path={CLIENT_ROUTES.nurse.triage.abcde(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard
                allowedRoles={[UserRole.NURSE, UserRole.NURSE_SUPERVISOR, UserRole.SUPER_ADMIN]}
              >
                <TriageWorkflow />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        {/* Legacy vitals route - redirect to ABCDE */}
        <Route
          path={CLIENT_ROUTES.nurse.triage.vitals(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        {/* Legacy routes - all redirect to abcde (consolidated workflow) */}
        <Route
          path={CLIENT_ROUTES.nurse.triage.suggestions(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path={CLIENT_ROUTES.nurse.triage.score(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path={CLIENT_ROUTES.nurse.triage.complete(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path={CLIENT_ROUTES.nurse.triage.esi(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path={CLIENT_ROUTES.nurse.triage.orientation(':id')}
          element={<Navigate to="../abcde" replace />}
        />
        <Route
          path={CLIENT_ROUTES.nurse.triage.summary(':id')}
          element={<Navigate to="../abcde" replace />}
        />

        {/* Nurse - Treatment routes */}
        <Route
          path={CLIENT_ROUTES.nurse.treatment.queue}
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
          path={CLIENT_ROUTES.nurse.treatment.patientCare(':id')}
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
          path={CLIENT_ROUTES.nurse.treatment.vitals(':id')}
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
          path={CLIENT_ROUTES.nurse.treatment.assignBox(':id')}
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
          path={CLIENT_ROUTES.nurse.treatment.retriage(':id')}
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
          path={CLIENT_ROUTES.nurse.treatment.alert(':id')}
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
          path={CLIENT_ROUTES.doctor.patients}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <MyPatients />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.patientDetail(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <PatientDetail />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.patientHistory(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <PatientHistory />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.abcdeReview(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <ABCDEReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.aiDiagnosis(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <AIPreDiagnosis />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.diagnosis(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <DiagnosisEntry />
              </RoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.doctor.ecg(':id')}
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={[UserRole.DOCTOR, UserRole.SUPER_ADMIN]}>
                <ECGReview />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Tracking board (all authenticated users) */}
        <Route
          path={CLIENT_ROUTES.shared.trackingBoard}
          element={
            <ProtectedRoute>
              <TrackingBoard />
            </ProtectedRoute>
          }
        />

        {/* Shared routes (all authenticated users) */}
        <Route
          path={CLIENT_ROUTES.shared.patientSearch}
          element={
            <ProtectedRoute>
              <PatientSearch />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.shared.patientDetail(':id')}
          element={
            <ProtectedRoute>
              <PatientDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.shared.patientTimeline(':id')}
          element={
            <ProtectedRoute>
              <PatientTimeline />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.shared.pathologyLookup}
          element={
            <ProtectedRoute>
              <PathologyLookup />
            </ProtectedRoute>
          }
        />
        <Route
          path={CLIENT_ROUTES.shared.interventionsLookup}
          element={
            <ProtectedRoute>
              <InterventionsLookup />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path={CLIENT_ROUTES.home} element={<Navigate to={CLIENT_ROUTES.dashboard} replace />} />
      </Routes>
    </HashRouter>
  );
}
