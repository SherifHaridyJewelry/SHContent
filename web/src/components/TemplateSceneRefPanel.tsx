import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  assetUrl,
  CatalogItem,
  SceneRefProductType,
} from "../api";
import { useJobStore } from "../stores/jobStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";

export const SCENE_TYPES: { value: SceneRefProductType; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "bracelet", label: "Bracelet" },
  { value: "ring", label: "Ring" },
  { value: "twin_rings", label: "Twin rings" },
  { value: "earrings", label: "Earrings" },
  { value: "necklace", label: "Necklace" },
  { value: "half_set", label: "Half set" },
  { value: "full_set", label: "Full set" },
  { value: "general", label: "General" },
];

const CORE_TYPES: SceneRefProductType[] = [
  "default",
  "ring",
  "twin_rings",
  "bracelet",
  "earrings",
  "necklace",
];

interface Props {
  templateName: string;
  sceneReferences: Record<string, string[]>;
  onUpdated: () => void;
}

export default function TemplateSceneRefPanel({
  templateName,
  sceneReferences,
  onUpdated,
}: Props) {
  const upsertScenePlateJob = useJobStore((s) => s.upsertScenePlateJob);
  const [assignType, setAssignType] = useState<SceneRefProductType>("default");
  const [urlInput, setUrlInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showKeptPicker, setShowKeptPicker] = useState(false);
  const [keptItems, setKeptItems] = useState<CatalogItem[]>([]);
  const [keptLoading, setKeptLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [distillingPath, setDistillingPath] = useState<string | null>(null);

  const totalRefs = useMemo(
    () => Object.values(sceneReferences).reduce((sum, urls) => sum + urls.length, 0),
    [sceneReferences]
  );

  const covered = useMemo(
    () => CORE_TYPES.filter((t) => (sceneReferences[t] ?? []).length > 0).length,
    [sceneReferences]
  );
  const missing = CORE_TYPES.length - covered;

  const loadKept = useCallback(async () => {
    setKeptLoading(true);
    try {
      const catalog = await api.listCatalog({
        page: 1,
        page_size: 48,
        review_status: "approved",
        exclude_scene_plates: true,
        sort: "newest",
      });
      const forTemplate = catalog.items.filter(
        (i) => i.template === templateName && !i.is_scene_plate
      );
      setKeptItems(forTemplate.length ? forTemplate : catalog.items.slice(0, 24));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load kept images");
    } finally {
      setKeptLoading(false);
    }
  }, [templateName]);

  useEffect(() => {
    if (showKeptPicker) loadKept().catch(() => undefined);
  }, [showKeptPicker, loadKept]);

  async function addUrls() {
    const urls = urlInput.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setSaving(true);
    try {
      await api.addTemplateSceneReferences(templateName, {
        product_type: assignType,
        output_paths: [],
        urls,
      });
      setUrlInput("");
      toast.success(`Added to ${templateName} · ${assignType}`);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function removeRef(productType: string, url: string) {
    try {
      await api.removeTemplateSceneReference(templateName, productType, url);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function moveRef(productType: string, url: string, direction: "up" | "down") {
    try {
      await api.reorderTemplateSceneReference(templateName, {
        product_type: productType,
        url,
        direction,
      });
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  async function distillFromKept(item: CatalogItem) {
    setDistillingPath(item.output_path);
    try {
      const job = await api.distillSceneRef(templateName, {
        output_path: item.output_path,
        scene_key: assignType,
      });
      upsertScenePlateJob(job);
      toast.success(`Creating scene reference for ${assignType}…`, {
        description: `Will appear in ${templateName} when the job finishes.`,
        action: {
          label: "View job",
          onClick: () => {
            window.location.href = `/studio/jobs/scene-plate/${job.id}`;
          },
        },
      });
      setShowKeptPicker(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Distill failed");
    } finally {
      setDistillingPath(null);
    }
  }

  const typeLabel = (key: string) =>
    SCENE_TYPES.find((t) => t.value === key)?.label ?? key;

  return (
    <div className="card mt-4 scene-library">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0">Scene library ({totalRefs})</h3>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">
            Empty-set references for generation. Distill from a kept product shot, or paste
            a URL under Advanced.
          </p>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            {covered} types covered
            {missing > 0 ? ` · ${missing} core types empty` : " · all core types filled"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowKeptPicker((v) => !v)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {showKeptPicker ? "Hide picker" : "Add from kept"}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide">
            Assign to type
          </Label>
          <Select
            value={assignType}
            onValueChange={(v) => setAssignType(v as SceneRefProductType)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                  {(sceneReferences[t.value] ?? []).length === 0 ? " · empty" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showKeptPicker && (
        <div className="scene-library-picker mb-5">
          <p className="mb-2 text-sm text-muted-foreground">
            Pick a kept output to distill into an empty set for{" "}
            <strong>{typeLabel(assignType)}</strong>.
          </p>
          {keptLoading ? (
            <p className="text-sm text-muted-foreground">Loading kept images…</p>
          ) : keptItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No kept images yet.{" "}
              <Link to="/outputs?tab=pending" className="underline">
                Review pending
              </Link>{" "}
              first.
            </p>
          ) : (
            <div className="scene-library-kept-grid">
              {keptItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="scene-library-kept-tile"
                  disabled={!!distillingPath}
                  onClick={() => distillFromKept(item).catch(() => undefined)}
                >
                  <img
                    src={assetUrl(item.output_path)}
                    alt={item.output_label ?? "Kept"}
                    loading="lazy"
                  />
                  <span>
                    {distillingPath === item.output_path
                      ? "Starting…"
                      : item.product_type ?? "Kept"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {SCENE_TYPES.map(({ value, label }) => {
        const urls = sceneReferences[value] ?? [];
        return (
          <div key={value} className="scene-library-group">
            <div className="scene-library-group-head">
              <strong>{label}</strong>
              <span className="text-xs text-muted-foreground">
                {urls.length === 0 ? "Empty" : `${urls.length} ref${urls.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {urls.length === 0 ? (
              <p className="scene-library-empty text-xs text-muted-foreground">
                No empty set for this type yet.
              </p>
            ) : (
              <div className="scene-library-grid">
                {urls.map((url) => (
                  <div key={url} className="scene-library-tile">
                    <img src={url} alt="" loading="lazy" />
                    <div className="scene-library-tile-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => moveRef(value, url, "up")}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => moveRef(value, url, "down")}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => removeRef(value, url)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <details
        className="mt-5"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Advanced · paste public URL
        </summary>
        <div className="mt-3 space-y-3">
          <Textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={2}
            placeholder="https://…"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={saving || !urlInput.trim()}
            onClick={() => addUrls().catch(() => undefined)}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding…
              </>
            ) : (
              `Add URL as ${typeLabel(assignType)}`
            )}
          </Button>
        </div>
      </details>
    </div>
  );
}
