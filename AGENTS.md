# AGENTS.md

SHContent — jewelry catalog image pipeline (KIE generation, templates, review workflow).

## Commands

See `README.md` and `PIPELINE.md` in this repo.

## Production

- **URL:** https://workflow.sherifharidyjewelry.com (DNS ready; Traefik routing TBD)
- **VPS:** `/opt/shcontent` · **Runtime:** `systemctl shcontent-api`

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
