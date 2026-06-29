import { Link } from "react-router-dom";
import { assetUrl, normalizeAssetPath } from "../api";
import { Button } from "@/components/ui/button"
import { Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"

export interface OutputPreviewData {
  output_path?: string | null;
  output_image?: string | null;
  prompt_path?: string | null;
  prompt_file?: string | null;
  image_url?: string | null;
  product_urls?: string[];
  output_r2_url?: string | null;
  task_id?: string | null;
  run_id?: string | null;
  job_id?: string | null;
}

function localPath(data: OutputPreviewData): string | null {
  const raw = data.output_path || data.output_image;
  if (!raw) return null;
  return normalizeAssetPath(raw);
}

function promptPath(data: OutputPreviewData): string | null {
  const raw = data.prompt_path || data.prompt_file;
  if (!raw) return null;
  return normalizeAssetPath(raw);
}

function CopyRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="output-link-row">
      <span className="output-link-label">{label}</span>
      <code className="output-link-value">{value}</code>
      <div className="output-link-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success("Copied!");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
        {href && (
          <Button asChild variant="secondary" size="sm">
            <a href={href} target="_blank" rel="noreferrer">
              Open <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function OutputPreview({ data }: { data: OutputPreviewData }) {
  const rel = localPath(data);
  const localAsset = rel ? assetUrl(rel) : null;
  const remote =
    data.output_r2_url || data.image_url || null;
  const previewSrc = localAsset || remote;
  const prompt = promptPath(data);
  const runId = data.run_id || data.job_id;

  if (!previewSrc && !rel && !remote) {
    return null;
  }

  return (
    <div className="output-preview">
      {previewSrc && (
        <a href={previewSrc} target="_blank" rel="noreferrer" className="output-preview-image-wrap">
          <img
            src={previewSrc}
            alt="Generated output"
            className="output-preview-image"
            onError={(e) => {
              if (remote && e.currentTarget.src !== remote) {
                e.currentTarget.src = remote;
              }
            }}
          />
        </a>
      )}

      <div className="output-links">
        {rel && (
          <CopyRow label="Local file" value={rel} href={localAsset || undefined} />
        )}
        {localAsset && <CopyRow label="App asset URL" value={localAsset} href={localAsset} />}
        {runId && (
          <div className="output-link-row">
            <span className="output-link-label">Run / job</span>
            <Link to={`/tasks/${runId}`} className="output-link-value">
              {runId}
            </Link>
          </div>
        )}
        {data.task_id && <CopyRow label="KIE task" value={data.task_id} />}
        {data.image_url && (
          <CopyRow label="KIE result URL" value={data.image_url} href={data.image_url} />
        )}
        {data.output_r2_url && (
          <CopyRow label="R2 output" value={data.output_r2_url} href={data.output_r2_url} />
        )}
        {data.product_urls?.map((url, i) => (
          <CopyRow
            key={url}
            label={data.product_urls!.length > 1 ? `R2 input ${i + 1}` : "R2 input"}
            value={url}
            href={url}
          />
        ))}
        {prompt && (
          <CopyRow label="Prompt JSON" value={prompt} href={assetUrl(prompt)} />
        )}
      </div>
    </div>
  );
}
