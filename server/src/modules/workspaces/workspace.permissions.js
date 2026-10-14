// Single source of truth for roles and permissions.
// REST middleware, services and (from Phase 7) Socket.IO handlers must all use this file.

// Highest rank first
export const ROLES = ['owner', 'admin', 'manager', 'member', 'guest'];
// 'owner' is created with the workspace and can never be granted through the API
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'owner');

const RANK = Object.fromEntries([...ROLES].reverse().map((role, i) => [role, i + 1]));

const OWNER = ['owner'];
const ADMINS = ['owner', 'admin'];
const MANAGERS = [...ADMINS, 'manager'];
const MEMBERS = [...MANAGERS, 'member'];
const EVERYONE = [...MEMBERS, 'guest'];

const ACTIONS = Object.freeze({
  'workspace:read': EVERYONE,
  'workspace:update': ADMINS,
  'workspace:delete': OWNER,

  'member:read': EVERYONE,
  'member:invite': ADMINS,
  'member:update': ADMINS,
  'member:remove': ADMINS,

  // Guests are further limited to projects they were added to (enforced in Phase 5)
  'project:read': EVERYONE,
  'project:create': MANAGERS,
  'project:update': MANAGERS,
  'project:delete': ADMINS,
  'project:manage_members': MANAGERS,

  'task:read': EVERYONE,
  'task:create': MEMBERS,
  'task:update': MEMBERS,
  'task:assign': MEMBERS,
  'task:delete': MANAGERS,

  'comment:create': EVERYONE,
  'comment:edit_own': EVERYONE,
  'comment:delete_own': EVERYONE,
  'comment:delete_any': MANAGERS,

  'message:read': EVERYONE,
  'message:create': EVERYONE,
  'message:edit_own': EVERYONE,
  'message:delete_own': EVERYONE,
  'message:delete_any': ADMINS,
});

export const ACTION_NAMES = Object.keys(ACTIONS);

// Object.hasOwn guards against inputs like "constructor" or "__proto__"
export const can = (role, action) => Object.hasOwn(ACTIONS, action) && ACTIONS[action].includes(role);

export const permissionsFor = (role) => ACTION_NAMES.filter((action) => can(role, action));

// base is e.g. 'comment:delete': allowed if the role may delete any, or may delete its own and is the author
export const canModify = (role, base, isAuthor) =>
  can(role, `${base}_any`) || (Boolean(isAuthor) && can(role, `${base}_own`));

// True when roleA is strictly higher than roleB. Unknown roles never outrank anything.
export const outranks = (roleA, roleB) =>
  Object.hasOwn(RANK, roleA) && Object.hasOwn(RANK, roleB) && RANK[roleA] > RANK[roleB];

// Guests only see projects they were explicitly added to
export const isProjectScoped = (role) => role === 'guest';