import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// This page redirects to the list page as CRUD is handled via modal
export default function InterventionForm() {
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    // Redirect to list page - editing is handled via modal
    navigate('/admin/interventions', {
      replace: true,
      state: { editId: id }
    });
  }, [navigate, id]);

  return null;
}
