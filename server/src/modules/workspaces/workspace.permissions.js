const RANK = { owner: 4, admin: 3, member: 2, guest: 1 };

const ACTIONS = {
  'workspace:read': ['owner', 'admin', 'member', 'guest'],
  'workspace:update': ['owner', 'admin'],
  'workspace:delete': ['owner'],
  'member:read': ['owner', 'admin', 'member', 'guest'],
  'member:invite': ['owner', 'admin'],
  'member:update': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
};

export const can = (role, action) => ACTIONS[action]?.includes(role) ?? false;

// True when roleA is strictly higher than roleB (admins cannot manage admins)
export const outranks = (roleA, roleB) => RANK[roleA] > RANK[roleB];