import { useState } from "react";
import {
  api,
  SceneRefProductType,
} from "../api";
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react"

const SCENE_TYPES: { value: SceneRefProductType; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "bracelet", label: "Bracelet" },
  { value: "ring", label: "Ring" },
  { value: "earrings", label: "Earrings" },
  { value: "necklace", label: "Necklace" },
  { value: "half_set", label: "Half set" },
  { value: "full_set", label: "Full set" },
  { value: "general", label: "General" },
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
  const [sceneType, setSceneType] = useState<SceneRefProductType>("default");
  const [urlInput, setUrlInput] = useState("");
  const [saving, setSaving] = useState(false);

  function showError(msg: string) {
    toast.error(msg);
  }

  async function addRefs() {
    const urls = urlInput.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
    setSaving(true);
    try {
      await api.addTemplateSceneReferences(templateName, {
        product_type: sceneType,
        output_paths: [],
        urls,
      });
      setUrlInput("");
      onUpdated();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function removeRef(productType: string, url: string) {
    try {
      await api.removeTemplateSceneReference(templateName, productType, url);
      onUpdated();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to remove");
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
      showError(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  const totalRefs = Object.values(sceneReferences).reduce((sum, urls) => sum + urls.length, 0);

  return (
    <div className="card mt-4">
      <h3>Scene references ({totalRefs})</h3>
      <p className="text-muted-foreground text-sm">
        Product-free scene plates used as style guides for generation.
        Create them on the Catalog page using the Distill button.
      </p>

      {Object.entries(sceneReferences).map(([key, urls]) =>
        urls.length > 0 ? (
          <div key={key} className="mt-4">
            <strong>{key}</strong>
            <div className="flex flex-wrap gap-3 mt-2">
              {urls.map((url) => (
                <div key={url} className="w-[100px]">
                  <img
                    src={url}
                    alt=""
                    className="w-full aspect-[4/5] object-cover rounded-md"
                  />
                  <div className="flex gap-[0.2rem] mt-1 flex-wrap">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => moveRef(key, url, "up")}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => moveRef(key, url, "down")}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removeRef(key, url)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      <div className="form-row mt-5">
        <div>
          <Label className="mb-1 block">Assign to product type</Label>
          <Select
            value={sceneType}
            onValueChange={(v) => setSceneType(v as SceneRefProductType)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="block mt-3">
        Public URL
        <Textarea value={urlInput} onChange={(e) => setUrlInput(e.target.value)} rows={2} />
      </label>

      <Button
        className="mt-4"
        disabled={saving || !urlInput.trim()}
        onClick={addRefs}
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding...</> : "Add URL"}
      </Button>
    </div>
  );
}