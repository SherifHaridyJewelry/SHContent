# AGENTS.md

SHContent — jewelry catalog image pipeline (KIE generation, templates, review workflow).

## Commands

See `README.md` and `PIPELINE.md` in this repo.

## Production

<<<<<<< HEAD
- **URL:** https://workflow.sherifharidyjewelry.com (DNS ready; Traefik routing TBD)
- **VPS:** `/opt/shcontent` · **Runtime:** `systemctl shcontent-api`
=======
- **URL:** https://workflow.sherifharidyjewelry.com
- **Health:** `GET /api/health`
- **VPS:** `/opt/shcontent` · secrets in `/etc/shcontent/.env`
- **Compose project:** `shcontent` (containers `shcontent-api-1`, etc.)
- **Database:** Postgres via Docker Compose (same pattern as SHFlow); `POSTGRES_PASSWORD` in `/etc/shcontent/.env`
>>>>>>> cursor/mobile-friendly-ui-eec2

## Cursor rules

| Rule | Path |
|------|------|
| DevOps / CI/CD | `.cursor/rules/devops-cicd.mdc` |
| Product pipeline | `.cursor/rules/product-pipeline.mdc` |

## Docs (cross-repo)

| Doc | Path |
|-----|------|
| Deployment record | `sh-ops/docs/DEPLOYMENT_SETUP.md` |
| DevOps runbook | `sh-ops/docs/DEVOPS.md` |
| Workspace index | `personal/AGENTS.md` |

## Deploy

Push to `main` → `.github/workflows/deploy.yml`. Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
