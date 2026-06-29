import { useState } from "react";
import { api, CatalogReviewResult } from "../api";
import { Button } from "@/components/ui/button"
import { ThumbsUp, ThumbsDown } from "lucide-react"

export type ReviewStatusValue = "approved" | "rejected" | "pending";

interface ReviewActionsProps {
  outputPath: string;
  productId: string | null;
  taskId?: string | null;
  currentStatus: string | null;
  isCanonical: boolean;
  compact?: boolean;
  onUpdated?: (result: CatalogReviewResult) => void;
  onError?: (message: string) => void;
}

export default function ReviewActions({
  outputPath,
  productId,
  taskId,
  currentStatus,
  isCanonical,
  compact = false,
  onUpdated,
  onError,
}: ReviewActionsProps) {
  const [busy, setBusy] = useState(false);

  async function apply(
    status: ReviewStatusValue,
    setCanonical = status === "approved"
  ) {
    if (!outputPath) return;
    setBusy(true);
    try {
      const result = await api.setCatalogReview({
        output_path: outputPath,
        status,
        set_canonical: setCanonical,
        product_id: productId ?? undefined,
        task_id: taskId ?? undefined,
      });
      onUpdated?.(result);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Review update failed");
    } finally {
      setBusy(false);
    }
  }

  async function setCanonicalOnly() {
    if (!productId) return;
    setBusy(true);
    try {
      const result = await api.setCanonicalOutput({
        product_id: productId,
        output_path: outputPath,
      });
      onUpdated?.(result);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not set canonical");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="default"
        size={compact ? "sm" : "default"}
        disabled={busy || (currentStatus === "approved" && isCanonical)}
        onClick={() => apply("approved", true)}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        Approve
      </Button>
      {productId && (
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={() => apply("approved", false)}
        >
          Approve only
        </Button>
      )}
      <Button
        variant="destructive"
        size={compact ? "sm" : "default"}
        disabled={busy}
        onClick={() => apply("rejected", false)}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        Reject
      </Button>
      {currentStatus && (
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={() => apply("pending", false)}
        >
          Reset
        </Button>
      )}
      {productId && currentStatus === "approved" && !isCanonical && (
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={setCanonicalOnly}
        >
          Set canonical
        </Button>
      )}
    </div>
  );
}
