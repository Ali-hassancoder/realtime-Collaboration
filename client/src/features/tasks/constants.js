export const STATUSES = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'in_review', label: 'In review' },
  { key: 'done', label: 'Done' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);

// Priority is always shown as text too, so color is never the only signal
export const PRIORITIES = [
  { key: 'low', label: 'Low', className: 'bg-slate-100 text-slate-700' },
  { key: 'medium', label: 'Medium', className: 'bg-blue-100 text-blue-800' },
  { key: 'high', label: 'High', className: 'bg-amber-100 text-amber-800' },
  { key: 'urgent', label: 'Urgent', className: 'bg-red-100 text-red-800' },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
export const PRIORITY_BY_KEY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));