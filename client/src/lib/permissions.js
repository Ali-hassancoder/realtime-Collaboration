const RANK = { owner: 4, admin: 3, member: 2, guest: 1 };

export const outranks = (a, b) => RANK[a] > RANK[b];
export const canManageMembers = (role) => role === 'owner' || role === 'admin';
export const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member', guest: 'Guest' };