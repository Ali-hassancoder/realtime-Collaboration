const BADGES = {
  joined: ['Live', 'bg-emerald-100 text-emerald-800 ring-emerald-600/20', 'bg-emerald-500'],
  connecting: ['Connecting...', 'bg-amber-100 text-amber-800 ring-amber-600/20', 'bg-amber-500'],
  error: ['Offline', 'bg-rose-100 text-rose-800 ring-rose-600/20', 'bg-rose-500'],
};

// Always shows text, so color is never the only signal
export default function LiveBadge({ status, error }) {
  const [label, className, dot] = BADGES[status] ?? BADGES.connecting;
  const animate = status !== 'error';
  return (
    <span
      role="status"
      title={error ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {animate && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}
