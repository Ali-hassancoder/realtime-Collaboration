export const STATUSES = [
  { key: 'todo', label: 'To do', dot: 'bg-sky-500', columnClass: 'bg-sky-50/80 ring-sky-100' },
  { key: 'in_progress', label: 'In progress', dot: 'bg-amber-500', columnClass: 'bg-amber-50/80 ring-amber-100' },
  { key: 'in_review', label: 'In review', dot: 'bg-violet-500', columnClass: 'bg-violet-50/80 ring-violet-100' },
  { key: 'done', label: 'Done', dot: 'bg-emerald-500', columnClass: 'bg-emerald-50/80 ring-emerald-100' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);

// Priority is always shown as text too, so color is never the only signal
export const PRIORITIES = [
  { key: 'low', label: 'Low', className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
  { key: 'medium', label: 'Medium', className: 'bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800' },
  { key: 'high', label: 'High', className: 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800' },
  { key: 'urgent', label: 'Urgent', className: 'bg-gradient-to-r from-rose-100 to-red-100 text-rose-700' },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
export const PRIORITY_BY_KEY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));