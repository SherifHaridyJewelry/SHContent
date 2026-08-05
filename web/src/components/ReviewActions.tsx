import { useState } from "react";
import { api, CatalogReviewResult } from "../api";
import { Button } from "@/components/ui/button";
import { Check, Star, ThumbsDown, Undo2 } from "lucide-react";

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

  async function apply(status: ReviewStatusValue) {
    if (!outputPath) return;
    setBusy(true);
    try {
      const result = await api.setCatalogReview({
        output_path: outputPath,
        status,
        set_canonical: false,
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

  async function setHero() {
    if (!productId) return;
    setBusy(true);
    try {
      const result = await api.setCanonicalOutput({
        product_id: productId,
        output_path: outputPath,
      });
      onUpdated?.(result);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not set hero");
    } finally {
      setBusy(false);
    }
  }

  async function clearHero() {
    if (!productId) return;
    setBusy(true);
    try {
      const result = await api.setCanonicalOutput({
        product_id: productId,
        output_path: null,
      });
      onUpdated?.(result);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not clear hero");
    } finally {
      setBusy(false);
    }
  }

  const isKept = currentStatus === "approved";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="default"
        size={compact ? "sm" : "default"}
        disabled={busy || isKept}
        onClick={() => apply("approved")}
      >
        <Check className="h-3.5 w-3.5" />
        Keep
      </Button>
      <Button
        variant="destructive"
        size={compact ? "sm" : "default"}
        disabled={busy || currentStatus === "rejected"}
        onClick={() => apply("rejected")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        Reject
      </Button>
      {currentStatus && (
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={() => apply("pending")}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Reset
        </Button>
      )}
      {productId && isKept && !isCanonical && (
        <Button
          variant="secondary"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={setHero}
        >
          <Star className="h-3.5 w-3.5" />
          Set as hero
        </Button>
      )}
      {productId && isCanonical && (
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          disabled={busy}
          onClick={clearHero}
        >
          Clear hero
        </Button>
      )}
    </div>
  );
}
