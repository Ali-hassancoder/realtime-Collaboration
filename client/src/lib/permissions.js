export const ROLES = ['owner', 'admin', 'manager', 'member', 'guest'];
// 'owner' can never be granted through the UI or API
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'owner');

const RANK = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Project manager',
  member: 'Member',
  guest: 'Guest',
};

export const outranks = (a, b) => (RANK[a] ?? 0) > (RANK[b] ?? 0);

// Reads the permission list the server sent with the workspace. UI hint only.
export const hasPermission = (workspace, action) => workspace?.permissions?.includes(action) ?? false;

// Kept for MemberList; prefer hasPermission(workspace, 'member:update') in new code
export const canManageMembers = (role) => role === 'owner' || role === 'admin';