import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { RefreshCw } from 'lucide-react';
import { CLIENT_ROUTES } from '../../routes';

/**
 * DiagnosisEntry page redirects to PatientDetail where the DiagnosisModal
 * provides full diagnosis entry functionality with AI suggestions.
 */
export default function DiagnosisEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      // Redirect to patient detail page where diagnosis modal can be opened
      navigate(CLIENT_ROUTES.doctor.patientDetail(id!), { replace: true });
    } else {
      // No patient ID provided, go back to patients list
      navigate(CLIENT_ROUTES.doctor.patients, { replace: true });
    }
  }, [id, navigate]);

  // Show loading while redirecting
  return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-full py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500">Redirection...</span>
      </div>
    </DashboardLayout>
  );
}
