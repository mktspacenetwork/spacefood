import { cn } from "../../lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-muted",
        className
      )}
    />
  );
}

export function SkeletonMenuPage() {
  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Shimmer className="h-8 w-48" />
          <Shimmer className="h-6 w-32 rounded-md" />
        </div>
        <div className="space-y-2">
          <Shimmer className="h-9 w-40 rounded-xl" />
          <Shimmer className="h-7 w-32 rounded-lg ml-auto" />
        </div>
      </div>
      <Shimmer className="h-14 w-full rounded-3xl" />
      <Shimmer className="h-12 w-full rounded-2xl" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-border overflow-hidden">
            <Shimmer className="aspect-[4/3] w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Shimmer className="h-4 w-3/4" />
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-8 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonProfilePage() {
  return (
    <div className="space-y-8 pt-4">
      <div className="flex items-center gap-4">
        <Shimmer className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Shimmer className="h-6 w-40" />
          <Shimmer className="h-4 w-56" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-border p-6 space-y-4">
          <Shimmer className="h-5 w-40" />
          <Shimmer className="h-[200px] w-full rounded-xl" />
        </div>
        <div className="rounded-3xl border border-border p-6 space-y-4">
          <Shimmer className="h-5 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Shimmer className="h-6 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Shimmer key={i} className="h-40 w-full rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonGenericPage() {
  return (
    <div className="space-y-6 pt-4">
      <Shimmer className="h-8 w-48" />
      <Shimmer className="h-4 w-80" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
