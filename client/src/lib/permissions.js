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

// Colorful gradient chips per role, used by <RoleBadge /> and workspace cards.
export const ROLE_STYLES = {
  owner: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white',
  admin: 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white',
  manager: 'bg-gradient-to-r from-violet-500 to-purple-500 text-white',
  member: 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white',
  guest: 'bg-gradient-to-r from-slate-400 to-slate-500 text-white',
};

export const outranks = (a, b) => (RANK[a] ?? 0) > (RANK[b] ?? 0);

// Reads the permission list the server sent with the workspace. UI hint only.
export const hasPermission = (workspace, action) => workspace?.permissions?.includes(action) ?? false;

// Kept for MemberList; prefer hasPermission(workspace, 'member:update') in new code
export const canManageMembers = (role) => role === 'owner' || role === 'admin';