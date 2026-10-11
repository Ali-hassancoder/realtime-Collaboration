import { useQuery } from '@tanstack/react-query';
import { getMe } from '../../services/auth';

export const AUTH_KEY = ['auth', 'me'];

export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_KEY,
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { user: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}