import { useEffect, useState } from "react";
import { api } from "../api";

export function usePendingReviewCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getCatalogMeta()
      .then((meta) => {
        if (!cancelled) {
          setCount(meta.counts_by_review?.pending ?? 0);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}

export function refreshPendingReviewCount(
  setter: (n: number) => void
): void {
  api
    .getCatalogMeta()
    .then((meta) => setter(meta.counts_by_review?.pending ?? 0))
    .catch(() => undefined);
}
