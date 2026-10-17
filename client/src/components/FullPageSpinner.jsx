export default function FullPageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="relative h-12 w-12 animate-float">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-500 border-r-fuchsia-500" />
        <div className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-b-cyan-400 border-l-violet-500 [animation-direction:reverse] [animation-duration:1.4s]" />
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
