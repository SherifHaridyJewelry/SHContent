import { create } from "zustand";
import { api, isJobActive, Job, JobProductResult, ScenePlateJob } from "../api";

const POLL_INTERVAL_MS = 2000;
const HIDDEN_POLL_INTERVAL_MS = 10000;
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
      await useJobStore.getState().refreshActiveJobs();
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
  refreshActiveJobs: () => Promise<void>;
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

  refreshActiveJobs: async () => {
    const [activeJobs, activeSceneJobs] = await Promise.all([
      api.listActiveJobs(),
      api.listActiveScenePlateJobs(),
    ]);
    set((state) => {
      const activeIds = new Set(activeJobs.map((j) => j.id));
      const inactive = state.jobs.filter((j) => !activeIds.has(j.id) && !isJobActive(j));
      const mergedJobs = [
        ...activeJobs,
        ...inactive.filter((j) => !activeIds.has(j.id)),
      ];
      const activeSceneIds = new Set(activeSceneJobs.map((j) => j.id));
      const inactiveScene = state.scenePlateJobs.filter(
        (j) => !activeSceneIds.has(j.id) && !isScenePlateJobActive(j)
      );
      const mergedScene = [
        ...activeSceneJobs,
        ...inactiveScene.filter((j) => !activeSceneIds.has(j.id)),
      ];
      return { jobs: mergedJobs, scenePlateJobs: mergedScene, loading: false };
    });
  },

  refreshJobs: async () => {
    await useJobStore.getState().refreshActiveJobs();
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
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePoll(intervalMs: number) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    const hidden = document.hidden;
    const { jobs, scenePlateJobs } = useJobStore.getState();
    const hasActive =
      jobs.some(isJobActive) || scenePlateJobs.some(isScenePlateJobActive);
    if (hasActive) {
      await useJobStore.getState().refreshActiveJobs().catch(() => undefined);
      await autoRecoverStaleJobs(useJobStore.getState().jobs).catch(() => undefined);
    }
    schedulePoll(hidden ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
  }, intervalMs);
}

export function startJobPolling(): () => void {
  if (pollStarted) return () => undefined;
  pollStarted = true;

  useJobStore.getState().refreshActiveJobs().catch(() => {
    useJobStore.setState({ loading: false });
  });

  schedulePoll(POLL_INTERVAL_MS);

  return () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollStarted = false;
  };
}
