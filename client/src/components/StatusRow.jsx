export default function StatusRow({ label, state, detail }) {
  const colors = {
    ok: 'bg-emerald-500',
    error: 'bg-rose-500',
    loading: 'bg-amber-400',
  };
  return (
    <li className="glass-card card-glow flex items-center justify-between rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3" aria-hidden="true">
          {state === 'loading' && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colors[state]} opacity-60`} />
          )}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${colors[state]}`} />
        </span>
        <span className="font-medium text-slate-800">{label}</span>
      </div>
      <span className="text-sm text-slate-500">{detail}</span>
    </li>
  );
}
