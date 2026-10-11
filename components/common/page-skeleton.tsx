/** Loading placeholder for signed-in pages. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}…</span>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
      <div className="h-28 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-xl bg-surface-2 motion-reduce:animate-none" />
    </div>
  );
}
