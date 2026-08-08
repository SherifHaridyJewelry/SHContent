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

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of secondary) map.set(item.id, item);
  for (const item of primary) map.set(item.id, item);
  return Array.from(map.values());
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
    const previous = useJobStore.getState();
    const previouslyActiveIds = previous.jobs.filter(isJobActive).map((j) => j.id);
    const previouslyActiveSceneIds = previous.scenePlateJobs
      .filter(isScenePlateJobActive)
      .map((j) => j.id);

    const [activeJobs, activeSceneJobs] = await Promise.all([
      api.listActiveJobs(),
      api.listActiveScenePlateJobs(),
    ]);

    const activeIds = new Set(activeJobs.map((j) => j.id));
    const activeSceneIds = new Set(activeSceneJobs.map((j) => j.id));
    const finishedIds = previouslyActiveIds.filter((id) => !activeIds.has(id));
    const finishedSceneIds = previouslyActiveSceneIds.filter(
      (id) => !activeSceneIds.has(id)
    );

    const [finishedJobs, finishedScenes] = await Promise.all([
      Promise.all(finishedIds.map((id) => api.getJob(id).catch(() => null))),
      Promise.all(
        finishedSceneIds.map((id) => api.getScenePlateJob(id).catch(() => null))
      ),
    ]);

    set((state) => {
      let jobs = mergeById(activeJobs, state.jobs);
      jobs = mergeById(
        finishedJobs.filter((j): j is Job => j != null),
        jobs
      ).sort((a, b) => b.created_at.localeCompare(a.created_at));

      let scenePlateJobs = mergeById(activeSceneJobs, state.scenePlateJobs);
      scenePlateJobs = mergeById(
        finishedScenes.filter((j): j is ScenePlateJob => j != null),
        scenePlateJobs
      ).sort((a, b) => b.created_at.localeCompare(a.created_at));

      return { jobs, scenePlateJobs, loading: false };
    });
  },

  refreshJobs: async () => {
    const [jobsResp, scenePlateJobs, activeJobs, activeSceneJobs] = await Promise.all([
      api.listJobs({ page: 1, page_size: 100 }),
      api.listScenePlateJobs(),
      api.listActiveJobs(),
      api.listActiveScenePlateJobs(),
    ]);
    const jobs = mergeById(activeJobs, jobsResp.items).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const scenes = mergeById(activeSceneJobs, scenePlateJobs).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    set({ jobs, scenePlateJobs: scenes, loading: false });
  },

  upsertJob: (job) => {
    set((state) => ({
      jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
      loading: false,
    }));
  },

  upsertScenePlateJob: (job) => {
    set((state) => ({
      scenePlateJobs: [
        job,
        ...state.scenePlateJobs.filter((j) => j.id !== job.id),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)),
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
    const state = useJobStore.getState();
    const hasActive =
      state.jobs.some(isJobActive) || state.scenePlateJobs.some(isScenePlateJobActive);
    if (hasActive) {
      await state.refreshActiveJobs().catch(() => undefined);
      await autoRecoverStaleJobs(useJobStore.getState().jobs).catch(() => undefined);
    }

    // Keep the open job detail fresh (product steps) even if list/active is lagging.
    const selected = useJobStore.getState().selectedTask;
    if (selected?.kind === "catalog") {
      try {
        const job = await api.getJob(selected.id);
        useJobStore.getState().upsertJob(job);
      } catch {
        /* ignore */
      }
    } else if (selected?.kind === "scene_plate") {
      try {
        const job = await api.getScenePlateJob(selected.id);
        useJobStore.getState().upsertScenePlateJob(job);
      } catch {
        /* ignore */
      }
    }

    schedulePoll(hidden ? HIDDEN_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
  }, intervalMs);
}

export function startJobPolling(): () => void {
  if (pollStarted) return () => undefined;
  pollStarted = true;

  useJobStore
    .getState()
    .refreshJobs()
    .catch(() => {
      useJobStore.setState({ loading: false });
    });

  schedulePoll(POLL_INTERVAL_MS);

  return () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollStarted = false;
  };
}
