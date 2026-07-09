import { useEffect, useState } from "react";
import { api, Job, ScenePlateJob } from "../api";
import { useJobStore } from "../stores/jobStore";

export function useJobDetail(jobId: string | undefined): {
  job: Job | null;
  loading: boolean;
} {
  const storeJob = useJobStore((s) =>
    jobId ? s.jobs.find((j) => j.id === jobId) ?? null : null
  );
  const upsertJob = useJobStore((s) => s.upsertJob);
  const [fetched, setFetched] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setFetched(null);
      return;
    }
    if (storeJob) {
      setFetched(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getJob(jobId)
      .then((job) => {
        if (cancelled) return;
        upsertJob(job);
        setFetched(job);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, storeJob, upsertJob]);

  return { job: storeJob ?? fetched, loading };
}

export function useScenePlateJobDetail(jobId: string | undefined): {
  job: ScenePlateJob | null;
  loading: boolean;
} {
  const storeJob = useJobStore((s) =>
    jobId ? s.scenePlateJobs.find((j) => j.id === jobId) ?? null : null
  );
  const upsertScenePlateJob = useJobStore((s) => s.upsertScenePlateJob);
  const [fetched, setFetched] = useState<ScenePlateJob | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setFetched(null);
      return;
    }
    if (storeJob) {
      setFetched(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getScenePlateJob(jobId)
      .then((job) => {
        if (cancelled) return;
        upsertScenePlateJob(job);
        setFetched(job);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, storeJob, upsertScenePlateJob]);

  return { job: storeJob ?? fetched, loading };
}
