import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface LoadingProps {
  /** 'spinner' | 'skeleton' | 'skeleton-grid' | 'skeleton-list' */
  variant?: "spinner" | "skeleton" | "skeleton-grid" | "skeleton-list"
  /** Number of skeleton items (for grid/list variants) */
  count?: number
  /** Optional message */
  message?: string
  className?: string
}

export function Loading({
  variant = "spinner",
  count = 4,
  message,
  className,
}: LoadingProps) {
  if (variant === "spinner") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 gap-3", className)}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    )
  }

  if (variant === "skeleton") {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
        <div className="pt-3">
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (variant === "skeleton-grid") {
    return (
      <div className={cn("space-y-3", className)}>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-[250px] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === "skeleton-list") {
    return (
      <div className={cn("space-y-3", className)}>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 border rounded-lg">
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return null
}