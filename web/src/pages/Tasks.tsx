import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isJobActive, Job, JobStatus, ScenePlateJob } from "../api";
import OutputPreview from "../components/OutputPreview";
import Pagination from "../components/Pagination";
import { referenceLabel, buildSelectableReferences } from "../lib/templateRefs";
import {
  ProductStepper,
  TaskStepper,
  jobProgressSummary,
  statusLabel,
} from "../components/TaskStepper";
import { formatGenerationLabel } from "../lib/outputNaming";
import { selectableRowClass } from "../lib/selectionStyles";
import {
  jobCanRecoverFromKie,
  SelectedTask,
  useActiveTaskCount,
  useJobStore,
} from "../stores/jobStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { useClientPagination } from "../hooks/useClientPagination";

function scenePlateProgressSummary(job: ScenePlateJob): string {
  const total = job.plates.length;
  const done = job.plates.filter(
    (p) => p.status === "success" || p.status === "failed"
  ).length;
  return `${done}/${total} plates`;
}

function isScenePlateActive(job: ScenePlateJob): boolean {
  return job.status === "pending" || job.status === "generating";
}

interface TaskRow {
  kind: SelectedTask["kind"];
  id: string;
  created_at: string;
  template: string;
  status: string;
  summary: string;
  active: boolean;
}

export default function Tasks() {
  const { jobId, scenePlateJobId } = useParams();
  const jobs = useJobStore((s) => s.jobs);
  const scenePlateJobs = useJobStore((s) => s.scenePlateJobs);
  const loading = useJobStore((s) => s.loading);
  const selectedTask = useJobStore((s) => s.selectedTask);
  const setSelectedTask = useJobStore((s) => s.setSelectedTask);
  const refreshJobs = useJobStore((s) => s.refreshJobs);
  const activeCount = useActiveTaskCount();

  const [recovering, setRecovering] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [refLabels, setRefLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (jobId) setSelectedTask({ kind: "catalog", id: jobId });
    else if (scenePlateJobId) setSelectedTask({ kind: "scene_plate", id: scenePlateJobId });
  }, [jobId, scenePlateJobId, setSelectedTask]);

  const selectedCatalog = useMemo(
    () =>
      selectedTask?.kind === "catalog"
        ? jobs.find((j) => j.id === selectedTask.id) ?? null
        : null,
    [jobs, selectedTask]
  );

  const selectedScenePlate = useMemo(
    () =>
      selectedTask?.kind === "scene_plate"
        ? scenePlateJobs.find((j) => j.id === selectedTask.id) ?? null
        : null,
    [scenePlateJobs, selectedTask]
  );

  const taskRows = useMemo((): TaskRow[] => {
    const catalogRows: TaskRow[] = jobs.map((job) => ({
      kind: "catalog",
      id: job.id,
      created_at: job.created_at,
      template: job.template,
      status: job.status,
      summary: jobProgressSummary(job),
      active: isJobActive(job),
    }));
    const sceneRows: TaskRow[] = scenePlateJobs.map((job) => ({
      kind: "scene_plate",
      id: job.id,
      created_at: job.created_at,
      template: job.template,
      status: job.status,
      summary: scenePlateProgressSummary(job),
      active: isScenePlateActive(job),
    }));
    return [...catalogRows, ...sceneRows].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }, [jobs, scenePlateJobs]);

  const {
    page,
    pageSize,
    total,
    totalPages,
    items: pagedTaskRows,
    onPageChange,
    onPageSizeChange,
  } = useClientPagination(taskRows, 10);

  useEffect(() => {
    if (!selectedCatalog?.template) return;
    api.getTemplate(selectedCatalog.template)
      .then((detail) => {
        const opts = buildSelectableReferences(detail);
        const map: Record<string, string> = {};
        for (const o of opts) map[o.url] = o.label;
        setRefLabels(map);
      })
      .catch(() => setRefLabels({}));
  }, [selectedCatalog?.template, selectedCatalog?.id]);

  async function handleRecover(jobIdToRecover: string) {
    setRecovering(true);
    try {
      await api.recoverJob(jobIdToRecover);
      await refreshJobs();
      toast.success("Job recovery started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recover failed");
    } finally {
      setRecovering(false);
    }
  }

  async function handleResume(jobIdToResume: string) {
    setResuming(true);
    try {
      await api.resumeJob(jobIdToResume);
      await refreshJobs();
      toast.success("Job resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resume failed");
    } finally {
      setResuming(false);
    }
  }

  const showRecoverKie = selectedCatalog && jobCanRecoverFromKie(selectedCatalog);

  const showResume =
    selectedCatalog &&
    selectedCatalog.products.some((p) => p.status !== "success") &&
    !showRecoverKie;

  const showPreKieHint =
    selectedCatalog &&
    isJobActive(selectedCatalog) &&
    !jobCanRecoverFromKie(selectedCatalog);

  function taskLink(row: TaskRow): string {
    return row.kind === "scene_plate"
      ? `/tasks/scene-plate/${row.id}`
      : `/tasks/${row.id}`;
  }

  function isRowSelected(row: TaskRow): boolean {
    return selectedTask?.kind === row.kind && selectedTask.id === row.id;
  }

  function statusBadgeVariant(status: string, active: boolean): "default" | "secondary" | "destructive" | "outline" {
    if (status === "failed") return "destructive";
    if (status === "success") return "default";
    if (active) return "default";
    return "secondary";
  }

  return (
    <div>
      <h2>Tasks</h2>
      <p className="text-muted-foreground mb-6">
        Catalog generation and scene plate jobs. For finished image review, see Review.
        For the output gallery, see Catalog.
        {activeCount > 0 && (
          <Badge variant="default" className="ml-2">
            {activeCount} running
          </Badge>
        )}
      </p>

      {loading && taskRows.length === 0 ? (
        <Loading variant="skeleton-list" message="Loading tasks..." />
      ) : taskRows.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="No tasks yet. Start catalog generation from Generate or scene plates from Templates."
        />
      ) : (
        <>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 25, 50]}
            position="top"
          />
          <table className="card" style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Type</th>
                <th>Started</th>
                <th>Template</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedTaskRows.map((row) => (
                <tr
                  key={`${row.kind}-${row.id}`}
                  onClick={() => setSelectedTask({ kind: row.kind, id: row.id })}
                  className={selectableRowClass(isRowSelected(row), "cursor-pointer")}
                >
                  <td>
                    <Link to={taskLink(row)} onClick={(e) => e.stopPropagation()}>
                      {row.id}
                    </Link>
                  </td>
                  <td>
                    <Badge variant="secondary">
                      {row.kind === "scene_plate" ? "scene plates" : "catalog"}
                    </Badge>
                  </td>
                  <td className="text-xs">{row.created_at.slice(0, 19)}</td>
                  <td>{row.template}</td>
                  <td className="text-xs text-muted-foreground">{row.summary}</td>
                  <td>
                    <Badge variant={statusBadgeVariant(row.status, row.active)}>
                      {row.active
                        ? row.kind === "catalog"
                          ? statusLabel(row.status as JobStatus)
                          : row.status
                        : row.status}
                    </Badge>
                    {row.kind === "catalog" && (() => {
                      const job = jobs.find((j) => j.id === row.id);
                      if (!job || !jobCanRecoverFromKie(job)) return null;
                      return (
                        <Badge variant="default" className="ml-1">
                          KIE recoverable
                        </Badge>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 25, 50]}
            position="bottom"
          />

          {showPreKieHint && (
            <p className="card text-xs text-muted-foreground mt-4">
              Job is still before or during KIE submission. <strong>Recover from KIE</strong>{" "}
              appears once a task ID is recorded (after the Generate step starts). If it is stuck on
              Upload or Analyze, use <strong>Resume pipeline</strong>.
            </p>
          )}
          {(showRecoverKie || showResume) && selectedCatalog && (
            <div className="card flex flex-wrap items-center gap-2 mt-4">
              <span className="text-xs text-muted-foreground mr-2">
                Job {selectedCatalog.id} needs attention:
              </span>
              {showResume && (
                <Button
                  variant="default"
                  disabled={resuming || recovering}
                  onClick={() => handleResume(selectedCatalog.id)}
                >
                  {resuming ? "Resuming…" : "Resume pipeline"}
                </Button>
              )}
              {showRecoverKie && (
                <Button
                  variant="default"
                  disabled={recovering || resuming}
                  onClick={() => handleRecover(selectedCatalog.id)}
                >
                  {recovering ? "Recovering…" : "Recover from KIE"}
                </Button>
              )}
            </div>
          )}

          {selectedCatalog && (
            <CatalogJobDetail
              job={selectedCatalog}
              refLabels={refLabels}
              recovering={recovering}
              resuming={resuming}
              showRecoverKie={!!showRecoverKie}
              showResume={!!showResume}
              onRecover={() => handleRecover(selectedCatalog.id)}
              onResume={() => handleResume(selectedCatalog.id)}
            />
          )}

          {selectedScenePlate && (
            <ScenePlateJobDetail job={selectedScenePlate} />
          )}
        </>
      )}
    </div>
  );
}

function CatalogJobDetail({
  job,
  refLabels,
  recovering,
  resuming,
  showRecoverKie,
  showResume,
  onRecover,
  onResume,
}: {
  job: Job;
  refLabels: Record<string, string>;
  recovering: boolean;
  resuming: boolean;
  showRecoverKie: boolean;
  showResume: boolean;
  onRecover: () => void;
  onResume: () => void;
}) {
  return (
    <div className="card mt-6">
      <h3>
        Catalog job {job.id}{" "}
        <Badge variant={job.status === "failed" ? "destructive" : job.status === "success" ? "default" : "secondary"}>
          {statusLabel(job.status)}
        </Badge>
      </h3>
      {job.error && <p className="text-destructive text-sm">{job.error}</p>}
      <p className="text-muted-foreground text-xs">
        {jobProgressSummary(job)} · Template: {job.template} · Analyze:{" "}
        {job.analyze ? "yes" : "no"} · Reference:{" "}
        {job.reference_mode === "none"
          ? "none"
          : job.reference_mode === "job"
            ? referenceLabel(
                Object.entries(refLabels).map(([url, label]) => ({
                  url,
                  source: "scene" as const,
                  sceneKey: null,
                  label,
                  thumbnailPath: null,
                })),
                job.selected_ref_url
              ) ?? job.selected_ref_url
            : "per-product"}
        {" · "}Updated: {job.updated_at.slice(0, 19)}
      </p>

      <div className="flex gap-2 flex-wrap mt-3">
        {showResume && (
          <Button variant="default" disabled={resuming || recovering} onClick={onResume}>
            {resuming ? "Resuming…" : "Resume pipeline"}
          </Button>
        )}
        {showRecoverKie && (
          <Button variant="default" disabled={recovering || resuming} onClick={onRecover}>
            {recovering ? "Recovering…" : "Recover from KIE"}
          </Button>
        )}
      </div>

      <h4 className="mt-5 mb-3">Overall progress</h4>
      <TaskStepper status={job.status} analyze={job.analyze} />

      {isJobActive(job) && <p className="task-live-hint">Updating every few seconds…</p>}

      <h4 className="mt-6 mb-3">
        Products ({job.products.length})
      </h4>
      <div className="task-products">
        {job.products.map((p) => (
          <div key={p.product_id} className="task-product-card">
            <div className="task-product-header">
              <strong>{p.product_id}</strong>
              <Badge
                variant={
                  p.status === "failed"
                    ? "destructive"
                    : p.status === "success"
                      ? "default"
                      : isJobActive(p)
                        ? "default"
                        : "secondary"
                }
              >
                {statusLabel(p.status)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground m-0 mb-3">
              Output: {formatGenerationLabel(p.output_name)}
              {p.resolved_ref_url && (
                <>
                  {" · "}Ref: {refLabels[p.resolved_ref_url] ?? p.resolved_ref_url.slice(-24)}
                </>
              )}
            </p>
            <ProductStepper product={p} analyze={job.analyze} />
            {p.error && <p className="text-destructive text-sm mt-3">{p.error}</p>}
            {(p.output_image || p.output_path || p.image_url) && (
              <div className="mt-4">
                <OutputPreview
                  data={{
                    ...p,
                    run_id: p.run_id || job.id,
                    job_id: job.id,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenePlateJobDetail({ job }: { job: ScenePlateJob }) {
  return (
    <div className="card mt-6">
      <h3>
        Scene plate job {job.id}{" "}
        <Badge variant={job.status === "failed" ? "destructive" : job.status === "success" ? "default" : "secondary"}>
          {statusLabel(job.status as JobStatus)}
        </Badge>
      </h3>
      {job.error && <p className="text-destructive text-sm">{job.error}</p>}
      <p className="text-muted-foreground text-xs">
        {scenePlateProgressSummary(job)} · Template: {job.template} · Updated:{" "}
        {job.updated_at.slice(0, 19)}
      </p>

      {isScenePlateActive(job) && <p className="task-live-hint">Updating every few seconds…</p>}

      <h4 className="mt-5 mb-3">
        Plates ({job.plates.length})
      </h4>
      <ul className="m-0 pl-5">
        {job.plates.map((plate) => (
          <li key={plate.id} className="mb-1">
            <code>{plate.id}</code>{" "}
            <Badge
              variant={
                plate.status === "failed"
                  ? "destructive"
                  : plate.status === "success"
                    ? "default"
                    : "secondary"
              }
            >
              {plate.status}
            </Badge>
            {plate.error && (
              <span className="text-muted-foreground text-xs"> — {plate.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}