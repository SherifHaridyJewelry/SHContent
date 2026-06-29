import type { ReactNode } from "react";
import { useJobStore } from "../stores/jobStore";

/** @deprecated Use useJobStore directly. Kept for gradual migration. */
export function useJobs() {
  const jobs = useJobStore((s) => s.jobs);
  const loading = useJobStore((s) => s.loading);
  const refreshJobs = useJobStore((s) => s.refreshJobs);
  const upsertJob = useJobStore((s) => s.upsertJob);

  const activeCount = useJobStore((s) => {
    const catalog = s.jobs.filter(
      (j) => j.status === "pending" || j.status === "uploading" || j.status === "analyzing" || j.status === "generating"
    ).length;
    const scene = s.scenePlateJobs.filter(
      (j) => j.status === "pending" || j.status === "generating"
    ).length;
    return catalog + scene;
  });

  return { jobs, loading, activeCount, refreshJobs, upsertJob };
}

/** No-op provider kept so Layout imports stay stable during migration. */
export function JobProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
