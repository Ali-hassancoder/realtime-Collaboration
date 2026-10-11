import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';
import FullPageSpinner from '../../components/FullPageSpinner';

export default function GuestRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}