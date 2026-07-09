import { Link } from "react-router-dom";
import {
  assetUrl,
  catalogDownloadUrl,
  CatalogItem,
  CatalogReviewResult,
  triggerDownload,
} from "../api";
import OutputPreview from "./OutputPreview";
import ReviewActions from "./ReviewActions";
import { anchorPathFromItem, reviewBadgeVariant } from "../lib/reviewUi";
import { formatGenerationLabel } from "../lib/outputNaming";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";

export const SCENE_KEYS = [
  { value: "default", label: "As general ref" },
  { value: "ring", label: "As ring ref" },
  { value: "bracelet", label: "As bracelet ref" },
  { value: "necklace", label: "As necklace ref" },
  { value: "earrings", label: "As earrings ref" },
  { value: "half_set", label: "As half set ref" },
  { value: "full_set", label: "As full set ref" },
  { value: "general", label: "As general product ref" },
];

interface OutputLightboxProps {
  item: CatalogItem;
  distillSceneKey: string;
  onDistillSceneKeyChange: (key: string) => void;
  distilling?: boolean;
  distillJobId?: string;
  onDistill?: () => void;
  onClose: () => void;
  onReviewUpdated: (result: CatalogReviewResult) => void;
  onError: (msg: string) => void;
  showDistill?: boolean;
}

export default function OutputLightbox({
  item,
  distillSceneKey,
  onDistillSceneKeyChange,
  distilling,
  distillJobId,
  onDistill,
  onClose,
  onReviewUpdated,
  onError,
  showDistill = true,
}: OutputLightboxProps) {
  const label =
    item.output_label ??
    item.product_name ??
    formatGenerationLabel(
      item.output_path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
    );

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-content card" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="secondary"
          size="sm"
          className="lightbox-close"
          onClick={onClose}
        >
          Close
        </Button>
        <h3>{label}</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerDownload(catalogDownloadUrl(item.output_path))}
          >
            <Download className="mr-2 h-4 w-4" />
            Download image
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {item.is_canonical && <Badge variant="default">canonical</Badge>}
          <Badge variant={reviewBadgeVariant(item.review_status)}>
            {item.review_status ?? "pending"}
          </Badge>
        </div>
        <div className="compare">
          <div>
            <p className="text-muted-foreground">Raw (anchor)</p>
            {(() => {
              const raw = anchorPathFromItem(item);
              return raw ? (
                <img src={assetUrl(raw)} alt="Raw" loading="lazy" />
              ) : (
                <p className="text-muted-foreground">No linked product anchor</p>
              );
            })()}
          </div>
          <div>
            <p className="text-muted-foreground">Generated</p>
            <OutputPreview data={item} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {item.template && <>Template: {item.template} · </>}
          Source: {item.source}
          {item.timestamp && <> · {item.timestamp.slice(0, 19)}</>}
          {item.task_id && <> · Task: {item.task_id}</>}
          {item.run_id && <> · Run: {item.run_id}</>}
        </p>
        {item.product_id && !item.is_scene_plate && (
          <div className="mt-4">
            <ReviewActions
              outputPath={item.output_path}
              productId={item.product_id}
              taskId={item.task_id}
              currentStatus={item.review_status}
              isCanonical={item.is_canonical}
              onUpdated={onReviewUpdated}
              onError={onError}
            />
            {showDistill && item.template && onDistill && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Reuse as reference:</span>
                <Select
                  value={distillSceneKey || undefined}
                  onValueChange={onDistillSceneKeyChange}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Distill to scene ref..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENE_KEYS.map((sk) => (
                      <SelectItem key={sk.value} value={sk.value}>
                        {sk.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!distillSceneKey || distilling}
                  onClick={onDistill}
                >
                  {distilling ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Distilling...
                    </>
                  ) : (
                    "Distill"
                  )}
                </Button>
                {distillJobId && (
                  <Link
                    to={`/studio/jobs/scene-plate/${distillJobId}`}
                    className="text-xs"
                  >
                    Job →
                  </Link>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Shortcuts: A approve · R reject · P reset · Esc close · ← → navigate
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
