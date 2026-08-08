import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const PENDING_EVENT = "shcontent:pending-review-changed";

export function notifyPendingReviewChanged(count?: number): void {
  window.dispatchEvent(
    new CustomEvent(PENDING_EVENT, { detail: { count } })
  );
}

export function usePendingReviewCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    api
      .getCatalogMeta()
      .then((meta) => setCount(meta.counts_by_review?.pending ?? 0))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setCount(detail.count);
        return;
      }
      refresh();
    }
    window.addEventListener(PENDING_EVENT, onChanged);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(PENDING_EVENT, onChanged);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return count;
}

export function refreshPendingReviewCount(setter: (n: number) => void): void {
  api
    .getCatalogMeta()
    .then((meta) => setter(meta.counts_by_review?.pending ?? 0))
    .catch(() => undefined);
}
