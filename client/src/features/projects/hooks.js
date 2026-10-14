import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../services/project';

// Nested under ['workspaces', id], so workspace-level invalidation also refreshes projects
const projectsKey = (workspaceId) => ['workspaces', workspaceId, 'projects'];

export const useProjects = (workspaceId, { status, page }) =>
  useQuery({
    queryKey: [...projectsKey(workspaceId), { status, page }],
    queryFn: () => api.listProjects(workspaceId, { status, page }),
    placeholderData: keepPreviousData,
  });

export const useProject = (workspaceId, projectId) =>
  useQuery({
    queryKey: [...projectsKey(workspaceId), projectId],
    queryFn: () => api.getProject(workspaceId, projectId),
    retry: false,
  });

export const useProjectMembers = (workspaceId, projectId) =>
  useQuery({
    queryKey: [...projectsKey(workspaceId), projectId, 'members'],
    queryFn: () => api.listProjectMembers(workspaceId, projectId),
  });

// Every project mutation must receive workspaceId so we know what to refresh
function useProjectMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: projectsKey(vars.workspaceId) }),
  });
}

export const useCreateProject = () => useProjectMutation(api.createProject);
export const useUpdateProject = () => useProjectMutation(api.updateProject);
export const useAddProjectMember = () => useProjectMutation(api.addProjectMember);
export const useRemoveProjectMember = () => useProjectMutation(api.removeProjectMember);

// After deleting, don't refetch the deleted project itself (it would 404 while we navigate away)
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: (_data, { workspaceId, projectId }) =>
      queryClient.invalidateQueries({
        queryKey: projectsKey(workspaceId),
        predicate: (query) => !query.queryKey.includes(projectId),
      }),
  });
}