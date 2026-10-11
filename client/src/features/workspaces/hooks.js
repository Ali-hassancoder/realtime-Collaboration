import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/workspaces';

export const useWorkspaces = () => useQuery({ queryKey: ['workspaces'], queryFn: api.listWorkspaces });

export const useWorkspace = (id) =>
  useQuery({ queryKey: ['workspaces', id], queryFn: () => api.getWorkspace(id), retry: false });

export const useMembers = (id) =>
  useQuery({ queryKey: ['workspaces', id, 'members'], queryFn: () => api.listMembers(id) });

export const useInvites = (id, enabled) =>
  useQuery({ queryKey: ['workspaces', id, 'invites'], queryFn: () => api.listInvites(id), enabled });

// Every workspace mutation refreshes all workspace queries. Simple and correct for now.
function useWorkspaceMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}

export const useCreateWorkspace = () => useWorkspaceMutation(api.createWorkspace);
export const useUpdateWorkspace = () => useWorkspaceMutation(api.updateWorkspace);
export const useDeleteWorkspace = () => useWorkspaceMutation(api.deleteWorkspace);
export const useUpdateMemberRole = () => useWorkspaceMutation(api.updateMemberRole);
export const useRemoveMember = () => useWorkspaceMutation(api.removeMember);
export const useCreateInvite = () => useWorkspaceMutation(api.createInvite);
export const useDeleteInvite = () => useWorkspaceMutation(api.deleteInvite);
export const useAcceptInvite = () => useWorkspaceMutation(api.acceptInvite);