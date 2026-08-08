import { Check, Circle, Loader2, X } from "lucide-react";
import { Job, JobProductResult, JobStatus, isJobActive } from "../api";

export interface ProgressStep {
  id: JobStatus;
  label: string;
  description: string;
  skipWhenNoAnalyze?: boolean;
}

export const PROGRESS_STEPS: ProgressStep[] = [
  { id: "pending", label: "Queued", description: "Waiting to start" },
  {
    id: "uploading",
    label: "Upload",
    description: "Uploading product images to R2",
  },
  {
    id: "analyzing",
    label: "Analyze",
    description: "Gemini vision analysis of the product",
    skipWhenNoAnalyze: true,
  },
  {
    id: "generating",
    label: "Generate",
    description: "Image generation (may take 1–3 min)",
  },
  {
    id: "success",
    label: "Finished",
    description: "Output saved to images/jewelry/",
  },
];

export type StepVisualState = "done" | "active" | "pending" | "failed" | "skipped";

export function stepsForJob(analyze: boolean): ProgressStep[] {
  return PROGRESS_STEPS.filter((s) => !(s.skipWhenNoAnalyze && !analyze));
}

export function stepVisualState(
  stepId: JobStatus,
  currentStatus: JobStatus,
  analyze: boolean
): StepVisualState {
  const order = stepsForJob(analyze).map((s) => s.id);
  const stepIdx = order.indexOf(stepId);
  if (stepIdx < 0) return "skipped";

  if (currentStatus === "success") return "done";

  if (currentStatus === "failed") {
    const failIdx = order.indexOf("generating");
    if (stepIdx < failIdx) return "done";
    if (stepIdx === failIdx) return "failed";
    return "pending";
  }

  const currentIdx = order.indexOf(currentStatus);
  if (currentIdx < 0) return "pending";

  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

export function statusLabel(status: JobStatus): string {
  const map: Record<JobStatus, string> = {
    pending: "Queued",
    uploading: "Uploading…",
    analyzing: "Analyzing…",
    generating: "Generating…",
    success: "Complete",
    failed: "Failed",
  };
  return map[status] ?? status;
}

export function jobProgressSummary(job: Job): string {
  const done = job.products.filter((p) => p.status === "success").length;
  const failed = job.products.filter((p) => p.status === "failed").length;
  const total = job.products.length;

  if (job.status === "success") return `All ${total} product(s) completed`;
  if (failed > 0) return `${done}/${total} done · ${failed} failed`;
  if (isJobActive(job)) {
    const activeProduct = job.products.find((p) => isJobActive(p))?.product_id;
    return `${done}/${total} done · ${statusLabel(job.status)}${
      activeProduct ? ` (${activeProduct})` : ""
    }`;
  }
  return `${done}/${total} products processed`;
}

function StepMarker({ state }: { state: StepVisualState }) {
  if (state === "done") {
    return <Check className="task-step-icon" strokeWidth={3} aria-hidden />;
  }
  if (state === "active") {
    return <Loader2 className="task-step-icon task-step-icon-spin" aria-hidden />;
  }
  if (state === "failed") {
    return <X className="task-step-icon" strokeWidth={3} aria-hidden />;
  }
  return <Circle className="task-step-icon task-step-icon-pending" aria-hidden />;
}

function stateStatusText(state: StepVisualState): string | null {
  if (state === "done") return "Done";
  if (state === "active") return "In progress";
  if (state === "failed") return "Failed";
  return null;
}

interface TaskStepperProps {
  status: JobStatus;
  analyze: boolean;
  compact?: boolean;
}

export function TaskStepper({ status, analyze, compact = false }: TaskStepperProps) {
  const steps = stepsForJob(analyze);

  return (
    <ol className={`task-stepper${compact ? " task-stepper-compact" : ""}`}>
      {steps.map((step) => {
        const state = stepVisualState(step.id, status, analyze);
        const statusText = stateStatusText(state);
        return (
          <li key={step.id} className={`task-step task-step-${state}`}>
            <span className="task-step-marker" aria-hidden>
              <StepMarker state={state} />
            </span>
            <div className="task-step-body">
              <strong>
                {step.label}
                {statusText && !compact && (
                  <span className="task-step-status">{statusText}</span>
                )}
              </strong>
              {!compact && <span>{step.description}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ProductStepper({
  product,
  analyze,
}: {
  product: JobProductResult;
  analyze: boolean;
}) {
  return <TaskStepper status={product.status} analyze={analyze} compact />;
}
