"""Runtime app settings: DB overrides layered over environment defaults.

Secret values are never returned in full — only configured/hint metadata.
Persisted overrides are applied to os.environ so pipeline scripts that call
os.getenv (KIE, R2) pick them up without restart.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

import requests

from app.db.engine import get_session
from app.db.repositories.settings import SettingsRepository

FieldType = Literal["string", "secret", "int", "bool", "select"]


@dataclass(frozen=True)
class SettingFieldDef:
    key: str
    label: str
    description: str
    group: str
    field_type: FieldType = "string"
    secret: bool = False
    env_backed: bool = False
    default: str = ""
    options: tuple[str, ...] = ()
    min_value: int | None = None
    max_value: int | None = None


GROUP_META: dict[str, dict[str, str]] = {
    "generation": {
        "title": "Image generation",
        "description": "KIE API credentials used for Nano Banana 2, GPT Image 2, and vision analysis.",
    },
    "r2": {
        "title": "Cloudflare R2",
        "description": "Object storage for product uploads and public image URLs the generation API can fetch.",
    },
    "security": {
        "title": "App security",
        "description": "Optional Bearer token required for API access in production. Leave empty to disable.",
    },
    "pipeline": {
        "title": "Pipeline defaults",
        "description": "Defaults that affect Studio batch generation and worker concurrency.",
    },
}

FIELD_DEFS: tuple[SettingFieldDef, ...] = (
    SettingFieldDef(
        key="KIE_API_KEY",
        label="KIE API key",
        description="Required for image generation and Gemini vision analysis.",
        group="generation",
        field_type="secret",
        secret=True,
        env_backed=True,
    ),
    SettingFieldDef(
        key="CF_ACCOUNT_ID",
        label="Account ID",
        description="Cloudflare account ID used to build the R2 S3 endpoint.",
        group="r2",
        env_backed=True,
    ),
    SettingFieldDef(
        key="CF_R2_ACCESS_KEY",
        label="Access key",
        description="R2 S3 API access key ID.",
        group="r2",
        field_type="secret",
        secret=True,
        env_backed=True,
    ),
    SettingFieldDef(
        key="CF_R2_SECRET_KEY",
        label="Secret key",
        description="R2 S3 API secret access key.",
        group="r2",
        field_type="secret",
        secret=True,
        env_backed=True,
    ),
    SettingFieldDef(
        key="CF_R2_BUCKET",
        label="Bucket",
        description="R2 bucket name for product and reference uploads.",
        group="r2",
        env_backed=True,
    ),
    SettingFieldDef(
        key="CF_R2_PUBLIC_URL",
        label="Public URL",
        description="Public base URL for objects (no trailing slash), e.g. https://cdn.example.com",
        group="r2",
        env_backed=True,
    ),
    SettingFieldDef(
        key="API_KEY",
        label="App API key",
        description=(
            "When set in production, clients must send Authorization: Bearer <key>. "
            "Save the same value in the browser field below so the UI can call the API."
        ),
        group="security",
        field_type="secret",
        secret=True,
        env_backed=True,
    ),
    SettingFieldDef(
        key="max_parallel_products",
        label="Max parallel products",
        description="How many products a Studio job processes at once (1–8).",
        group="pipeline",
        field_type="int",
        default="3",
        min_value=1,
        max_value=8,
    ),
    SettingFieldDef(
        key="default_generation_model",
        label="Default generation model",
        description="Pre-selected model when opening Studio batch generate.",
        group="pipeline",
        field_type="select",
        default="nano-banana-2",
        options=("nano-banana-2", "gpt-image-2-image-to-image"),
    ),
    SettingFieldDef(
        key="default_analyze",
        label="Vision analysis by default",
        description="When enabled, new Studio jobs turn on Gemini product analysis.",
        group="pipeline",
        field_type="bool",
        default="false",
    ),
)

_FIELD_BY_KEY = {f.key: f for f in FIELD_DEFS}
_ENV_KEYS = {f.key for f in FIELD_DEFS if f.env_backed}

# Snapshot of process env for env-backed keys before DB overrides are applied.
_BOOT_ENV: dict[str, str] | None = None
_STORED_CACHE: dict[str, str] | None = None


def _ensure_boot_env() -> dict[str, str]:
    global _BOOT_ENV
    if _BOOT_ENV is None:
        _BOOT_ENV = {key: os.getenv(key, "") or "" for key in _ENV_KEYS}
    return _BOOT_ENV


def _mask_hint(value: str) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def _coerce_bool(raw: str) -> bool:
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_fallback(key: str) -> str:
    return os.getenv(key, "") or ""


def _load_stored(*, force: bool = False) -> dict[str, str]:
    global _STORED_CACHE
    if _STORED_CACHE is not None and not force:
        return dict(_STORED_CACHE)
    with get_session() as session:
        _STORED_CACHE = SettingsRepository(session).get_all()
    return dict(_STORED_CACHE)


def get_effective(key: str) -> str:
    """DB override wins; else env (for env-backed keys); else field default."""
    stored = _load_stored()
    if key in stored:
        return stored[key]
    field = _FIELD_BY_KEY.get(key)
    if field and field.env_backed:
        return _env_fallback(key)
    if field:
        return field.default
    return _env_fallback(key)


def get_int(key: str, default: int) -> int:
    raw = get_effective(key)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def get_bool(key: str, default: bool = False) -> bool:
    raw = get_effective(key)
    if raw == "" and key not in _load_stored():
        return default
    return _coerce_bool(raw)


def apply_env_overrides(
    stored: dict[str, str] | None = None,
    *,
    cleared_keys: set[str] | None = None,
) -> None:
    """Push env-backed overrides into os.environ for script helpers.

    Keys present in ``stored`` overwrite process env. Keys in ``cleared_keys``
    are restored from the boot snapshot. All other keys are left untouched.
    """
    values = stored if stored is not None else _load_stored()
    cleared = cleared_keys or set()
    if values or cleared:
        boot = _ensure_boot_env()
    else:
        boot = _BOOT_ENV or {}
    for key in _ENV_KEYS:
        if key in values:
            os.environ[key] = values[key]
        elif key in cleared:
            boot_val = boot.get(key, "")
            if boot_val:
                os.environ[key] = boot_val
            else:
                os.environ.pop(key, None)


def apply_stored_settings_on_startup() -> None:
    try:
        stored = _load_stored(force=True)
        if stored:
            apply_env_overrides(stored)
    except Exception:
        # DB may not be migrated yet during very early boot; entrypoint runs alembic first.
        pass


def reset_runtime_state_for_tests() -> None:
    """Clear caches between tests."""
    global _BOOT_ENV, _STORED_CACHE
    _BOOT_ENV = None
    _STORED_CACHE = None
    # Drop leftover process overrides from prior tests so monkeypatch stays authoritative.
    for key in _ENV_KEYS:
        os.environ.pop(key, None)


def get_settings_public() -> dict[str, Any]:
    stored = _load_stored()
    apply_env_overrides(stored)

    groups: dict[str, dict[str, Any]] = {}
    for group_id, meta in GROUP_META.items():
        groups[group_id] = {
            "id": group_id,
            "title": meta["title"],
            "description": meta["description"],
            "fields": [],
        }

    for field in FIELD_DEFS:
        if field.key in stored:
            effective = stored[field.key]
            source = "database"
        elif field.env_backed and _env_fallback(field.key):
            effective = _env_fallback(field.key)
            source = "environment"
        else:
            effective = field.default
            source = "default"

        if field.secret or field.env_backed:
            configured = bool(str(effective).strip())
        else:
            configured = True
        entry: dict[str, Any] = {
            "key": field.key,
            "label": field.label,
            "description": field.description,
            "type": field.field_type,
            "secret": field.secret,
            "configured": configured,
            "source": source,
            "options": list(field.options) if field.options else None,
            "min": field.min_value,
            "max": field.max_value,
        }
        if field.secret:
            entry["hint"] = _mask_hint(effective) if effective else None
            entry["value"] = None
        elif field.field_type == "bool":
            entry["value"] = _coerce_bool(effective) if effective != "" else _coerce_bool(
                field.default
            )
            entry["hint"] = None
        elif field.field_type == "int":
            try:
                entry["value"] = int(effective)
            except (TypeError, ValueError):
                entry["value"] = int(field.default or "0")
            entry["hint"] = None
        else:
            entry["value"] = effective
            entry["hint"] = None

        groups[field.group]["fields"].append(entry)

    kie = bool(get_effective("KIE_API_KEY").strip())
    r2_keys = (
        "CF_ACCOUNT_ID",
        "CF_R2_ACCESS_KEY",
        "CF_R2_SECRET_KEY",
        "CF_R2_BUCKET",
        "CF_R2_PUBLIC_URL",
    )
    r2 = all(bool(get_effective(k).strip()) for k in r2_keys)
    auth = bool(get_effective("API_KEY").strip())

    return {
        "groups": list(groups.values()),
        "status": {
            "kie_configured": kie,
            "r2_configured": r2,
            "app_auth_enabled": auth,
        },
        "defaults": {
            "max_parallel_products": get_int("max_parallel_products", 3),
            "default_generation_model": get_effective("default_generation_model")
            or "nano-banana-2",
            "default_analyze": get_bool("default_analyze", False),
        },
    }


def update_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload:
        return get_settings_public()

    unknown = [k for k in payload if k not in _FIELD_BY_KEY]
    if unknown:
        raise ValueError(f"Unknown setting keys: {', '.join(sorted(unknown))}")

    updates: dict[str, str] = {}
    for key, raw in payload.items():
        field = _FIELD_BY_KEY[key]
        if field.secret:
            if raw is None:
                continue
            if not isinstance(raw, str):
                raise ValueError(f"{key} must be a string")
            # Empty string clears the override (falls back to env).
            updates[key] = raw.strip()
            continue

        if field.field_type == "bool":
            if isinstance(raw, bool):
                updates[key] = "true" if raw else "false"
            elif isinstance(raw, str):
                updates[key] = "true" if _coerce_bool(raw) else "false"
            else:
                raise ValueError(f"{key} must be a boolean")
            continue

        if field.field_type == "int":
            try:
                num = int(raw)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{key} must be an integer") from exc
            if field.min_value is not None and num < field.min_value:
                raise ValueError(f"{key} must be >= {field.min_value}")
            if field.max_value is not None and num > field.max_value:
                raise ValueError(f"{key} must be <= {field.max_value}")
            updates[key] = str(num)
            continue

        if field.field_type == "select":
            value = str(raw).strip()
            if field.options and value not in field.options:
                raise ValueError(
                    f"{key} must be one of: {', '.join(field.options)}"
                )
            updates[key] = value
            continue

        updates[key] = str(raw).strip()

    with get_session() as session:
        repo = SettingsRepository(session)
        # Clearing a secret with empty string: delete DB row so env fallback applies.
        to_set: dict[str, str] = {}
        cleared: set[str] = set()
        for key, value in updates.items():
            field = _FIELD_BY_KEY[key]
            if field.secret and value == "":
                repo.delete(key)
                cleared.add(key)
            else:
                to_set[key] = value
        if to_set:
            # Snapshot boot env before first override so clear can restore it.
            _ensure_boot_env()
            repo.set_many(to_set)

    stored = _load_stored(force=True)
    apply_env_overrides(stored, cleared_keys=cleared)
    return get_settings_public()


def test_kie_connection() -> dict[str, Any]:
    api_key = get_effective("KIE_API_KEY").strip()
    if not api_key:
        return {"ok": False, "detail": "KIE API key is not configured"}
    try:
        resp = requests.get(
            "https://api.kie.ai/api/v1/chat/credit",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        if resp.status_code in (401, 403):
            return {"ok": False, "detail": "KIE rejected the API key"}
        if resp.status_code >= 500:
            return {
                "ok": False,
                "detail": f"KIE server error ({resp.status_code})",
            }
        # 200 or other 4xx (e.g. unknown path) still proves auth often returns 401 when bad.
        # Treat non-auth failures as reachable with key accepted when not 401/403.
        if resp.status_code == 404:
            # Fallback probe used by job APIs
            resp2 = requests.post(
                "https://api.kie.ai/api/v1/jobs/recordInfo",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"taskId": "settings-probe"},
                timeout=15,
            )
            if resp2.status_code in (401, 403):
                return {"ok": False, "detail": "KIE rejected the API key"}
            return {"ok": True, "detail": "KIE API key accepted"}
        return {"ok": True, "detail": "KIE API key accepted"}
    except requests.RequestException as exc:
        return {"ok": False, "detail": f"Could not reach KIE API: {exc}"}


def test_r2_connection() -> dict[str, Any]:
    account_id = get_effective("CF_ACCOUNT_ID").strip()
    access_key = get_effective("CF_R2_ACCESS_KEY").strip()
    secret_key = get_effective("CF_R2_SECRET_KEY").strip()
    bucket = get_effective("CF_R2_BUCKET").strip()
    public_url = get_effective("CF_R2_PUBLIC_URL").strip()
    missing = [
        name
        for name, val in (
            ("CF_ACCOUNT_ID", account_id),
            ("CF_R2_ACCESS_KEY", access_key),
            ("CF_R2_SECRET_KEY", secret_key),
            ("CF_R2_BUCKET", bucket),
            ("CF_R2_PUBLIC_URL", public_url),
        )
        if not val
    ]
    if missing:
        return {
            "ok": False,
            "detail": f"Missing R2 settings: {', '.join(missing)}",
        }
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        client.head_bucket(Bucket=bucket)
        return {"ok": True, "detail": f"Connected to R2 bucket “{bucket}”"}
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        return {"ok": False, "detail": f"R2 error: {code}"}
    except (BotoCoreError, Exception) as exc:
        return {"ok": False, "detail": f"R2 connection failed: {exc}"}
