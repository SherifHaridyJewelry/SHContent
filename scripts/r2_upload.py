#!/usr/bin/env python3
"""Manage files on Cloudflare R2 (S3-compatible object storage).

Supports uploading local images (with auto-generated public URLs),
listing bucket contents, and deleting objects. Used by the product
pipeline to make raw product photos and inspiration images accessible
to the KIE API.
"""

import argparse
import json
import mimetypes
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 30 * 1024 * 1024  # 30 MB (KIE API limit)


def get_r2_config():
    load_dotenv(PROJECT_ROOT / ".env")
    config = {
        "account_id": os.getenv("CF_ACCOUNT_ID"),
        "access_key": os.getenv("CF_R2_ACCESS_KEY"),
        "secret_key": os.getenv("CF_R2_SECRET_KEY"),
        "bucket": os.getenv("CF_R2_BUCKET"),
        "public_url": os.getenv("CF_R2_PUBLIC_URL", "").rstrip("/"),
    }
    missing = [k for k, v in config.items() if not v]
    if missing:
        print(f"ERROR: Missing R2 config in .env: {', '.join(missing)}")
        print("See .env.example for required variables.")
        sys.exit(1)
    return config


def get_s3_client(config: dict):
    endpoint = f"https://{config['account_id']}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=config["access_key"],
        aws_secret_access_key=config["secret_key"],
        region_name="auto",
    )


def validate_image(filepath: Path):
    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}")
        return False
    if filepath.suffix.lower() not in ALLOWED_EXTENSIONS:
        print(f"ERROR: Unsupported format {filepath.suffix} (allowed: {', '.join(ALLOWED_EXTENSIONS)})")
        return False
    if filepath.stat().st_size > MAX_FILE_SIZE:
        size_mb = filepath.stat().st_size / (1024 * 1024)
        print(f"ERROR: File too large ({size_mb:.1f} MB, max 30 MB): {filepath}")
        return False
    return True


def make_object_key(filepath: Path, prefix: str) -> str:
    timestamp = int(time.time())
    safe_name = filepath.name.replace(" ", "_").lower()
    return f"{prefix}/{timestamp}_{safe_name}"


def upload_file(s3_client, config: dict, filepath: Path, prefix: str = "products") -> str | None:
    if not validate_image(filepath):
        return None

    key = make_object_key(filepath, prefix)
    content_type = mimetypes.guess_type(str(filepath))[0] or "image/jpeg"

    try:
        s3_client.upload_file(
            str(filepath),
            config["bucket"],
            key,
            ExtraArgs={"ContentType": content_type},
        )
    except (ClientError, NoCredentialsError) as e:
        print(f"ERROR uploading {filepath.name}: {e}")
        return None

    public_url = f"{config['public_url']}/{key}"
    return public_url


def cmd_upload(args):
    config = get_r2_config()
    s3 = get_s3_client(config)

    paths = []
    for p in args.paths:
        path = Path(p)
        if path.is_dir():
            for ext in ALLOWED_EXTENSIONS:
                paths.extend(path.glob(f"*{ext}"))
                paths.extend(path.glob(f"*{ext.upper()}"))
        elif path.is_file():
            paths.append(path)
        else:
            print(f"WARNING: Skipping {p} (not found)")

    if not paths:
        print("ERROR: No valid image files found.")
        sys.exit(1)

    prefix = args.prefix or "products"
    results = []

    for filepath in paths:
        print(f"Uploading {filepath.name}...", end=" ")
        url = upload_file(s3, config, filepath, prefix=prefix)
        if url:
            print(f"OK -> {url}")
            results.append({"file": str(filepath), "url": url})
        else:
            print("FAILED")

    if args.json:
        print("\n" + json.dumps(results, indent=2))
    else:
        print(f"\n{len(results)}/{len(paths)} files uploaded successfully.")

    if results:
        urls = [r["url"] for r in results]
        print("\nURLs (copy-paste ready):")
        for url in urls:
            print(f"  {url}")


def cmd_list(args):
    config = get_r2_config()
    s3 = get_s3_client(config)

    kwargs = {"Bucket": config["bucket"]}
    if args.prefix:
        kwargs["Prefix"] = args.prefix

    try:
        response = s3.list_objects_v2(**kwargs)
    except ClientError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    objects = response.get("Contents", [])
    if not objects:
        print("Bucket is empty." if not args.prefix else f"No objects with prefix '{args.prefix}'.")
        return

    print(f"{'Key':<60} {'Size':>10} {'Modified'}")
    print("-" * 90)
    for obj in sorted(objects, key=lambda o: o["LastModified"], reverse=True):
        size_kb = obj["Size"] / 1024
        modified = obj["LastModified"].strftime("%Y-%m-%d %H:%M")
        print(f"{obj['Key']:<60} {size_kb:>8.1f}KB {modified}")

    print(f"\nTotal: {len(objects)} objects")


def cmd_delete(args):
    config = get_r2_config()
    s3 = get_s3_client(config)

    for key in args.keys:
        try:
            s3.delete_object(Bucket=config["bucket"], Key=key)
            print(f"Deleted: {key}")
        except ClientError as e:
            print(f"ERROR deleting {key}: {e}")


def cmd_url(args):
    """Print the public URL for an existing object key."""
    config = get_r2_config()
    for key in args.keys:
        print(f"{config['public_url']}/{key}")


def main():
    parser = argparse.ArgumentParser(description="Manage files on Cloudflare R2")
    sub = parser.add_subparsers(dest="command", required=True)

    p_upload = sub.add_parser("upload", help="Upload image(s) to R2")
    p_upload.add_argument("paths", nargs="+", help="Image files or directories to upload")
    p_upload.add_argument("--prefix", default="products", help="Object key prefix (default: products)")
    p_upload.add_argument("--json", action="store_true", help="Output results as JSON")

    p_list = sub.add_parser("list", help="List objects in the R2 bucket")
    p_list.add_argument("--prefix", default=None, help="Filter by key prefix")

    p_delete = sub.add_parser("delete", help="Delete object(s) from R2")
    p_delete.add_argument("keys", nargs="+", help="Object key(s) to delete")

    p_url = sub.add_parser("url", help="Print public URL for object key(s)")
    p_url.add_argument("keys", nargs="+", help="Object key(s)")

    args = parser.parse_args()

    commands = {
        "upload": cmd_upload,
        "list": cmd_list,
        "delete": cmd_delete,
        "url": cmd_url,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
