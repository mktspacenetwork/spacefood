import { cn } from "../../lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-muted", className)} />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-border bg-card overflow-hidden animate-pulse", className)}>
      <div className="aspect-[4/3] w-full bg-muted" />
      <div className="p-3 sm:p-5 space-y-3">
        <div className="h-4 bg-muted rounded-full w-3/4" />
        <div className="h-3 bg-muted rounded-full w-full" />
        <div className="h-3 bg-muted rounded-full w-1/2" />
        <div className="flex items-center justify-between pt-2 border-t border-border border-dashed mt-2">
          <div className="h-3 bg-muted rounded-full w-16" />
          <div className="h-8 bg-muted rounded-full w-20" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-0 divide-y divide-border">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 bg-accent/40">
        {[45, 30, 15, 10].map((w, i) => (
          <div key={i} className={`h-3 bg-muted rounded w-${w === 45 ? '[45%]' : w === 30 ? '[30%]' : w === 15 ? '[15%]' : '[10%]'}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <div className="h-9 w-9 bg-muted rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-muted rounded w-1/3" />
            <div className="h-2.5 bg-muted rounded w-1/2" />
          </div>
          <div className="h-5 w-20 bg-muted rounded-full" />
          <div className="h-5 w-16 bg-muted rounded-full" />
          <div className="h-6 w-20 bg-muted rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRoleCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-muted rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted rounded w-2/3" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
          </div>
          <div className="h-2.5 bg-muted rounded w-1/3" />
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-5 w-14 bg-muted rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonSettings() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-pulse">
      <div className="space-y-1">
        <Shimmer className="h-6 w-36" />
        <Shimmer className="h-3.5 w-56" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-4 space-y-3">
          <Shimmer className="h-4 w-40" />
          <div className="grid md:grid-cols-2 gap-3">
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
          </div>
        </div>
        {[0, 1].map(i => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <Shimmer className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between items-center">
                <Shimmer className="h-3 w-40" />
                <Shimmer className="h-7 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}