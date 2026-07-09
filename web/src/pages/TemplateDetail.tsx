import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import ImagePickerGrid from "../components/ImagePickerGrid";
import PageHeader from "../components/PageHeader";
import TemplateSceneRefPanel from "../components/TemplateSceneRefPanel";
import { useGenerateStore } from "../stores/generateStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/ui/Loading";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function TemplateDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const setTemplate = useGenerateStore((s) => s.setTemplate);

  const [template, setTemplateData] = useState<Record<string, unknown> | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacySelected, setLegacySelected] = useState<Set<string>>(new Set());
  const [legacyUrl, setLegacyUrl] = useState("");
  const [legacySaving, setLegacySaving] = useState(false);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      const tmpl = await api.getTemplate(name);
      setTemplateData(tmpl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    }
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  if (!name) return <p className="text-muted-foreground">Template not found</p>;
  if (!template) return <Loading variant="skeleton" />;

  const scene = (template.scene ?? {}) as Record<string, string>;
  const lighting = (template.lighting ?? {}) as Record<string, string>;
  const camera = (template.camera ?? {}) as Record<string, string>;
  const sceneRefs = (template.scene_references ?? {}) as Record<string, string[]>;
  const styleRefs = (template.style_references ?? []) as string[];

  async function addLegacyRefs() {
    const urls = legacyUrl.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
    setLegacySaving(true);
    try {
      await api.addTemplateStyleReferences(name!, {
        output_paths: Array.from(legacySelected),
        urls,
      });
      setLegacySelected(new Set());
      setLegacyUrl("");
      await load();
      toast.success("Legacy style refs added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLegacySaving(false);
    }
  }

  function useInStudio() {
    setTemplate(name!);
    toast.success(`Template set to ${name}`);
    navigate("/studio?tab=batch");
  }

  return (
    <div>
      <p>
        <Link
          to="/templates"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Templates
        </Link>
      </p>
      <PageHeader
        title={String(template.template_name ?? name)}
        description={`${String(template.category)} · ${String(
          (template.api_parameters as Record<string, string>)?.aspect_ratio ?? "4:5"
        )}`}
        actions={
          <Button onClick={useInStudio}>Use in Studio</Button>
        }
      />

      <div className="card">
        <h3>Overview</h3>
        <p>
          <strong>Surface:</strong> {scene.surface}
        </p>
        <p>
          <strong>Background:</strong> {scene.background}
        </p>
        <p>
          <strong>Lighting:</strong> {lighting.setup}
        </p>
        <p>
          <strong>Camera:</strong> {camera.focal_length} · {camera.shooting_angle}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => setShowJson(!showJson)}
        >
          {showJson ? "Hide" : "Show"} raw JSON
        </Button>
        {showJson && (
          <pre className="mt-3 overflow-auto text-xs">
            {JSON.stringify(template, null, 2)}
          </pre>
        )}
      </div>

      <TemplateSceneRefPanel
        templateName={name}
        sceneReferences={sceneRefs}
        onUpdated={load}
      />

      <details
        className="card mt-4"
        open={showLegacy}
        onToggle={(e) => setShowLegacy((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-medium">
          Legacy style references ({styleRefs.length})
        </summary>
        <div className="mt-3">
          <p className="text-sm">
            Prefer distilled scene references from{" "}
            <Link to="/outputs?tab=gallery" className="underline">
              Outputs → Distill
            </Link>
            .
          </p>
          <p className="text-sm text-destructive">
            Warning: finished product images may contaminate product design.
          </p>
          {styleRefs.length > 0 && (
            <ul>
              {styleRefs.map((url) => (
                <li key={url} className="break-all text-xs">
                  {url}
                </li>
              ))}
            </ul>
          )}
          <Textarea
            value={legacyUrl}
            onChange={(e) => setLegacyUrl(e.target.value)}
            placeholder="https://..."
            className="mt-2"
          />
          <ImagePickerGrid
            selected={legacySelected}
            onToggle={(path) =>
              setLegacySelected((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
          />
          <Button
            variant="secondary"
            className="mt-3"
            disabled={legacySaving}
            onClick={addLegacyRefs}
          >
            {legacySaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add legacy style refs
          </Button>
        </div>
      </details>
    </div>
  );
}
