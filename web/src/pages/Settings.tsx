import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  GENERATION_MODELS,
  type SettingsField,
  type SettingsResponse,
} from "../api";
import PageHeader from "../components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound, Save } from "lucide-react";
import {
  BROWSER_API_KEY_STORAGE,
  getBrowserApiKey,
  setBrowserApiKey,
} from "../lib/browserApiKey";

type Draft = Record<string, string | number | boolean>;

function statusBadge(ok: boolean, label: string) {
  return (
    <Badge variant={ok ? "secondary" : "outline"} className="gap-1.5 font-normal">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
      ) : (
        <CircleAlert className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {label}
    </Badge>
  );
}

function fieldPlaceholder(field: SettingsField): string {
  if (field.secret) {
    if (field.configured && field.hint) return `Configured ${field.hint}`;
    if (field.configured) return "Configured — enter a new value to replace";
    return "Not set";
  }
  return "";
}

export default function Settings() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingKie, setTestingKie] = useState(false);
  const [testingR2, setTestingR2] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [secretTouched, setSecretTouched] = useState<Record<string, boolean>>({});
  const [browserApiKey, setBrowserApiKeyState] = useState(() => getBrowserApiKey());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.getSettings();
      setData(next);
      const nextDraft: Draft = {};
      for (const group of next.groups) {
        for (const field of group.fields) {
          if (field.secret) continue;
          if (field.value !== null && field.value !== undefined) {
            nextDraft[field.key] = field.value as string | number | boolean;
          }
        }
      }
      setDraft(nextDraft);
      setSecretTouched({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const dirty = useMemo(() => {
    if (!data) return false;
    if (Object.keys(secretTouched).some((k) => secretTouched[k])) return true;
    for (const group of data.groups) {
      for (const field of group.fields) {
        if (field.secret) continue;
        const current = draft[field.key];
        const original = field.value;
        if (field.type === "bool") {
          if (Boolean(current) !== Boolean(original)) return true;
        } else if (String(current ?? "") !== String(original ?? "")) {
          return true;
        }
      }
    }
    return false;
  }, [data, draft, secretTouched]);

  function setField(key: string, value: string | number | boolean, secret = false) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (secret) {
      setSecretTouched((prev) => ({ ...prev, [key]: true }));
    }
  }

  async function onSave() {
    if (!data) return;
    setSaving(true);
    try {
      const values: Record<string, string | number | boolean> = {};
      for (const group of data.groups) {
        for (const field of group.fields) {
          if (field.secret) {
            if (secretTouched[field.key]) {
              values[field.key] = String(draft[field.key] ?? "");
            }
            continue;
          }
          const current = draft[field.key];
          if (field.type === "bool") {
            if (Boolean(current) !== Boolean(field.value)) {
              values[field.key] = Boolean(current);
            }
          } else if (field.type === "int") {
            if (Number(current) !== Number(field.value)) {
              values[field.key] = Number(current);
            }
          } else if (String(current ?? "") !== String(field.value ?? "")) {
            values[field.key] = String(current ?? "");
          }
        }
      }

      const next = await api.updateSettings(values);
      setData(next);
      const nextDraft: Draft = {};
      for (const group of next.groups) {
        for (const field of group.fields) {
          if (field.secret) continue;
          if (field.value !== null && field.value !== undefined) {
            nextDraft[field.key] = field.value as string | number | boolean;
          }
        }
      }
      setDraft(nextDraft);
      setSecretTouched({});

      if (values.API_KEY !== undefined) {
        const key = String(values.API_KEY);
        setBrowserApiKey(key);
        setBrowserApiKeyState(key);
      }

      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function onTestKie() {
    setTestingKie(true);
    try {
      const result = await api.testKieConnection();
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "KIE test failed");
    } finally {
      setTestingKie(false);
    }
  }

  async function onTestR2() {
    setTestingR2(true);
    try {
      const result = await api.testR2Connection();
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "R2 test failed");
    } finally {
      setTestingR2(false);
    }
  }

  function saveBrowserApiKey() {
    setBrowserApiKey(browserApiKey.trim());
    toast.success(
      browserApiKey.trim()
        ? "Browser API key saved for this device"
        : "Browser API key cleared"
    );
  }

  if (loading && !data) {
    return <Loading variant="skeleton" message="Loading settings..." />;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Settings" description="Could not load settings." />
        <Button onClick={() => load()}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="API keys and pipeline defaults used by Studio generation. Secrets are stored on the server and never shown in full."
        actions={
          <Button onClick={onSave} disabled={saving || !dirty}>
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {statusBadge(
          data.status.kie_configured,
          data.status.kie_configured ? "KIE configured" : "KIE missing"
        )}
        {statusBadge(
          data.status.r2_configured,
          data.status.r2_configured ? "R2 configured" : "R2 incomplete"
        )}
        {statusBadge(
          data.status.app_auth_enabled,
          data.status.app_auth_enabled ? "API auth on" : "API auth off"
        )}
      </div>

      <div className="flex flex-col gap-5">
        {data.groups.map((group) => (
          <section key={group.id} className="card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0">{group.title}</h3>
                <p className="mb-0 mt-1 text-sm text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {group.id === "generation" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onTestKie}
                  disabled={testingKie}
                >
                  {testingKie ? "Testing…" : "Test KIE"}
                </Button>
              )}
              {group.id === "r2" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onTestR2}
                  disabled={testingR2}
                >
                  {testingR2 ? "Testing…" : "Test R2"}
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {group.fields.map((field) => (
                <div key={field.key} className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
                  <div className="pt-2">
                    <Label htmlFor={`setting-${field.key}`}>{field.label}</Label>
                    {field.source && field.source !== "default" && (
                      <p className="mb-0 mt-1 text-xs text-muted-foreground">
                        Source: {field.source}
                      </p>
                    )}
                  </div>
                  <div>
                    {field.type === "bool" ? (
                      <label className="flex items-center gap-2 pt-2 text-sm">
                        <Checkbox
                          id={`setting-${field.key}`}
                          checked={Boolean(draft[field.key])}
                          onCheckedChange={(v) =>
                            setField(field.key, v === true)
                          }
                        />
                        <span className="text-muted-foreground">{field.description}</span>
                      </label>
                    ) : field.type === "select" ? (
                      <>
                        <Select
                          value={String(draft[field.key] ?? field.value ?? "")}
                          onValueChange={(v) => setField(field.key, v)}
                        >
                          <SelectTrigger id={`setting-${field.key}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((opt) => {
                              const known = GENERATION_MODELS.find(
                                (m) => m.value === opt
                              );
                              return (
                                <SelectItem key={opt} value={opt}>
                                  {known?.label ?? opt}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="mb-0 mt-1.5 text-xs text-muted-foreground">
                          {field.description}
                        </p>
                      </>
                    ) : (
                      <>
                        <Input
                          id={`setting-${field.key}`}
                          type={
                            field.secret
                              ? "password"
                              : field.type === "int"
                                ? "number"
                                : "text"
                          }
                          autoComplete="off"
                          spellCheck={false}
                          min={field.min ?? undefined}
                          max={field.max ?? undefined}
                          placeholder={fieldPlaceholder(field)}
                          value={
                            field.secret
                              ? String(draft[field.key] ?? "")
                              : String(draft[field.key] ?? "")
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (field.type === "int") {
                              setField(field.key, raw === "" ? "" : Number(raw));
                            } else {
                              setField(field.key, raw, field.secret);
                            }
                          }}
                        />
                        <p className="mb-0 mt-1.5 text-xs text-muted-foreground">
                          {field.description}
                          {field.secret && field.configured
                            ? " Leave blank and save to clear the stored override."
                            : null}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="card">
          <div className="mb-4 flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="m-0">Browser API access</h3>
              <p className="mb-0 mt-1 text-sm text-muted-foreground">
                Stored only in this browser ({BROWSER_API_KEY_STORAGE}). Used as{" "}
                <code className="text-xs">Authorization: Bearer …</code> when app
                API auth is enabled in production.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="browser-api-key">Browser API key</Label>
              <Input
                id="browser-api-key"
                className="mt-2"
                type="password"
                autoComplete="off"
                value={browserApiKey}
                onChange={(e) => setBrowserApiKeyState(e.target.value)}
                placeholder="Paste the same App API key used on the server"
              />
            </div>
            <Button type="button" variant="secondary" onClick={saveBrowserApiKey}>
              Save for this device
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={onSave} disabled={saving || !dirty}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
