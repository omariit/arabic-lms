---
name: lms-railway-deploy
description: Use when deploying, configuring, or debugging the arabic-lms app or its recording-service on Railway (environments, variables, volumes, build args, scale-to-zero, migrations, health polling)
---

# Deploying arabic-lms on Railway

## The two environments

| | staging | production |
|---|---|---|
| App | `arabic-lms-staging.up.railway.app` | `arabic-lms-production.up.railway.app` |
| Env ID | `055e377c-5c00-4a5e-9c05-41201356e5b1` | `fcc7407a-f67d-4973-89d6-d59c4056b9a7` |
| Postgres proxy | `shinkansen.proxy.rlwy.net:14090` | `turntable.proxy.rlwy.net:21532` |
| Recording service | `recording-service-staging.up.railway.app` | `recording-service-production-1c73df77.up.railway.app` |

Project `6f7d787d-cfd7-4e05-9766-efedc67ee4eb`; app service `06d2c22c-1f56-448f-b2e5-21935d510314`;
recording service `558121b9-fb89-45de-bcc7-c6c27ce7ef22`. Never touch the other Railway projects
(`web`, `teachers-courses`, `shopPOS`).

## Deploy loop (always verify, never assume)

```bash
cd /d/training-course/lms
npx tsc --noEmit && npx next build            # catch it locally first
railway up -e staging -s arabic-lms --detach  # recording service: railway up ./recording-service --path-as-root -s recording-service -e <env> --detach
for i in $(seq 1 10); do S=$(curl -s -o /dev/null -w "%{http_code}" https://<host>/api/health); echo "$i: $S"; [ "$S" = 200 ] && break; sleep 20; done
```

Old revision keeps serving while the new one builds (~3–4 min). Testing before `/api/health` is 200
means testing the old build. `railway up` has silently skipped a build before — compare the
deployment id and the new behaviour.

## Variables

```bash
railway variables -s <service> -e <env> --kv                 # read
railway variables -s <service> -e <env> --set K=V --skip-deploys
MSYS_NO_PATHCONV=1 railway variables ... --set DATA_DIR=/data/recordings   # Git Bash would rewrite the path
railway variables -s <service> -e <env> delete K             # (delete subcommand, not --unset)
```

Docker builds only see variables declared as `ARG` in the `Dockerfile`. `NEXT_PUBLIC_*` are baked at
build time — declare the ARG **and** pass server values as props so a missing build arg cannot break
the browser.

## Volumes and sleeping

- Create a volume per environment via GraphQL (the CLI has no `--service` flag for `volume add`):
  `railway api 'mutation { volumeCreate(input: {projectId, environmentId, serviceId, mountPath: "/data/recordings"}) { id name } }'`
- `railway volume list` shows what is attached where (per linked environment).
- Sleeping (scale to zero) is per service instance: `serviceInstanceUpdate(input: { sleepApplication: true })`.
  A slept service answers 502/503 or times out on the first request — clients must warm and retry
  (see `lms-recording-pipeline`). Volumes persist across sleeps; in-flight chunks live on that volume.
- Railway's registry occasionally fails a build with `x509: certificate has expired` — that is their
  infrastructure, not the code: redeploy after a few minutes.

## Database work

```bash
PW=$(railway variables -e <env> -s Postgres --kv | grep -o "^POSTGRES_PASSWORD=.*" | cut -d= -f2-)
DATABASE_URL="postgresql://postgres:${PW}@<proxy>/railway" node prisma/seed-qa.mjs   # staging only
```

`railway run` does not work (internal hostname) — always use the public TCP proxy. Migrations run in
the container start command (`prisma migrate deploy`); a schema change needs a deploy, not a manual run.

## Production safety

- Password/credential changes: `prisma/set-staff.mjs` or a one-off bcrypt script, then kill sessions.
- Never seed production. QA (`npm run qa`) is staging-only; production has a read-only smoke
  (`tests/e2e/06-smoke.spec.ts` with `QA_SMOKE=1`).
- After any deploy, run the production smoke and one real user flow (login → the changed screen).
