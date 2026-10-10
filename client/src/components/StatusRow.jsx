export default function StatusRow({ label, state, detail }) {
  const colors = {
    ok: 'bg-green-500',
    error: 'bg-red-500',
    loading: 'bg-yellow-400 animate-pulse',
  };
  return (
    <li className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${colors[state]}`} aria-hidden="true" />
        <span className="font-medium text-slate-800">{label}</span>
      </div>
      <span className="text-sm text-slate-500">{detail}</span>
    </li>
  );
}