import { create } from "zustand";
import { api, isJobActive, Job, JobProductResult, ScenePlateJob } from "../api";

const POLL_INTERVAL_MS = 2000;
const STALE_JOB_MS = 60_000;

const autoRecoverAttempted = new Set<string>();

export type TaskKind = "catalog" | "scene_plate";

export interface SelectedTask {
  kind: TaskKind;
  id: string;
}

function isScenePlateJobActive(job: ScenePlateJob): boolean {
  return job.status === "pending" || job.status === "generating";
}

export function productCanRecoverFromKie(p: JobProductResult): boolean {
  return !!p.task_id && p.status !== "success";
}

export function jobCanRecoverFromKie(job: Job): boolean {
  return job.products.some(productCanRecoverFromKie);
}

function jobIsStaleWithKieTask(job: Job): boolean {
  if (!isJobActive(job) || !jobCanRecoverFromKie(job)) return false;
  const age = Date.now() - new Date(job.updated_at).getTime();
  if (age < STALE_JOB_MS) return false;
  return job.products.some(
    (p) => productCanRecoverFromKie(p) && !p.output_path
  );
}

async function autoRecoverStaleJobs(jobs: Job[]): Promise<void> {
  for (const job of jobs) {
    if (!jobIsStaleWithKieTask(job)) continue;
    if (autoRecoverAttempted.has(job.id)) continue;
    autoRecoverAttempted.add(job.id);
    try {
      const result = await api.recoverJob(job.id);
      await useJobStore.getState().refreshJobs();
      if (result.still_waiting?.length) {
        autoRecoverAttempted.delete(job.id);
      }
    } catch {
      autoRecoverAttempted.delete(job.id);
    }
  }
}

interface JobStoreState {
  jobs: Job[];
  scenePlateJobs: ScenePlateJob[];
  loading: boolean;
  selectedTask: SelectedTask | null;
  refreshJobs: () => Promise<void>;
  upsertJob: (job: Job) => void;
  upsertScenePlateJob: (job: ScenePlateJob) => void;
  setSelectedTask: (task: SelectedTask | null) => void;
}

export const useJobStore = create<JobStoreState>((set) => ({
  jobs: [],
  scenePlateJobs: [],
  loading: true,
  selectedTask: null,

  refreshJobs: async () => {
    const [jobsResp, scenePlateJobs] = await Promise.all([
      api.listJobs({ page: 1, page_size: 500 }),
      api.listScenePlateJobs(),
    ]);
    set({ jobs: jobsResp.items, scenePlateJobs, loading: false });
  },

  upsertJob: (job) => {
    set((state) => ({
      jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)],
      loading: false,
    }));
  },

  upsertScenePlateJob: (job) => {
    set((state) => ({
      scenePlateJobs: [job, ...state.scenePlateJobs.filter((j) => j.id !== job.id)],
      loading: false,
    }));
  },

  setSelectedTask: (task) => set({ selectedTask: task }),
}));

export function useActiveTaskCount(): number {
  const jobs = useJobStore((s) => s.jobs);
  const scenePlateJobs = useJobStore((s) => s.scenePlateJobs);
  return (
    jobs.filter(isJobActive).length + scenePlateJobs.filter(isScenePlateJobActive).length
  );
}

let pollStarted = false;

export function startJobPolling(): () => void {
  if (pollStarted) return () => undefined;
  pollStarted = true;

  const tick = async () => {
    const { jobs, scenePlateJobs } = useJobStore.getState();
    const hasActive =
      jobs.some(isJobActive) || scenePlateJobs.some(isScenePlateJobActive);
    if (!hasActive) return;
    await useJobStore.getState().refreshJobs().catch(() => undefined);
    await autoRecoverStaleJobs(useJobStore.getState().jobs).catch(() => undefined);
  };

  useJobStore.getState().refreshJobs().catch(() => {
    useJobStore.setState({ loading: false });
  });

  const interval = setInterval(tick, POLL_INTERVAL_MS);
  return () => {
    clearInterval(interval);
    pollStarted = false;
  };
}
