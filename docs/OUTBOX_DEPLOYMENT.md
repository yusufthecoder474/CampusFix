# Setup and deployment

## Existing Windows installation

Use **PowerShell**, Node 24 and the existing synthetic CampusFix database. Keep the original `.env` and original Compose database volume. Do not run setup against your existing installation or replace its password.

1. Back up the synthetic database using your existing PostgreSQL backup procedure.
2. Review `db/003_outbox.sql`. Existing migrations 001 and 002 are unchanged.
3. Install locked dependencies, check the application and apply migration 003:

```powershell
npm ci
npm run check
npm run lint
npm run migrate
npm run build
```

The migration runner uses its existing advisory lock, checksum tracking and transaction. A failure rolls back the migration. New source events will now also require a successful outbox insert; review test results before applying to any important installation.

4. Run the application using its existing `npm start` command. Start mocks and worker in separate windows as documented in [extension README](../extension/README.md).

5. Native acceptance uses a separate disposable database ending in `_test`:

```powershell
npm run db:test:prepare
node --env-file=.env --test extension/tests/postgres.integration.mjs
npm run test:integration
npm test
npm run test:frontend
npm run test:e2e:native
```

The new native test creates a random private schema and removes it in a finally block. It refuses URLs whose database name does not end in `_test`. Do not substitute the application database.

## Optional container demonstration

`Dockerfile` builds React and backend code, installs runtime-only dependencies and runs as the unprivileged Node user. `compose.delivery.yaml` adds app, worker and mock processes without creating another database or modifying `compose.yaml`.

These files are **provided but unexecuted here**. Use a new local PowerShell window and set `DATABASE_URL` privately to the existing synthetic database using a hostname reachable from containers. On Docker Desktop, `host.docker.internal` can reach the host's mapped PostgreSQL port; `127.0.0.1` from a container refers to that container. Do not change the original database volume credentials.

```powershell
docker compose -p campusfix-delivery -f compose.delivery.yaml config --quiet
docker compose -p campusfix-delivery -f compose.delivery.yaml up --build -d
docker compose -p campusfix-delivery -f compose.delivery.yaml ps
docker compose -p campusfix-delivery -f compose.delivery.yaml logs --tail 50 worker
docker compose -p campusfix-delivery -f compose.delivery.yaml down
```

Run the migration from the host before starting this stack. Stop the original application process if it already uses port 3100; leave the original database running. This Compose override explicitly uses development mode for loopback HTTP and should not be exposed publicly. The production image expects an HTTPS `APP_ORIGIN`; do not copy local cookie settings to a public service. Shutdown uses the existing backend signal handling; worker shutdown finishes its current attempt and closes its pool.

The image build copies source but excludes `.env`, dependencies, VCS files and local evidence. Memory/CPU limits are starting configuration values, not validated capacity or a performance claim.

## Azure status and proposed architecture

No Azure CLI, authenticated subscription or resource inventory was available in this session. The public RootScope URL could not be accessed through the available web reader; that is not proof of an outage. No resources were created, no credentials requested, no cloud deployment verified and no live VerifyFlow URL exists.

Lowest infrastructure complexity is one API Container App, one continuously scheduled worker process and a managed PostgreSQL database. A Container Apps Job scheduled to drain a bounded number of events is a possible later alternative, but the current poll-loop worker is not a bounded job runner. Do not deploy it as a scheduled job without adding exit limits and overlap tests.

An API can use scale-to-zero if cold starts are acceptable. A continuously running polling worker cannot scale to zero and independently wake itself for a database event. Database charges can continue while application compute is idle. Reusing a Container Apps environment is potentially useful; reusing the RootScope application or its secrets is unnecessary.

**No numeric cost estimate is defensible yet:** region, subscription credits, database SKU/storage/backups, log retention, runtime and egress are unknown. Before provisioning, inspect the actual subscription and existing resources, select SKUs, obtain current Azure calculator estimates, and secure explicit approval for that concrete cost. Budget alerts are not hard caps.

Read-only PowerShell inventory commands, if Azure CLI is installed on your computer:

```powershell
az account show --query "{subscription:name,state:state}" -o table
az group list --query "[].{name:name,location:location}" -o table
az containerapp list --query "[].{name:name,group:resourceGroup,location:location}" -o table
az postgres flexible-server list --query "[].{name:name,group:resourceGroup,sku:sku.name}" -o table
```

Share only nonsecret resource names, regions and selected SKUs if deployment is to proceed. Do not paste access tokens, connection strings or credentials.

## Operations and failure diagnosis

| Symptom                              | Check                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Worker cannot find `workflow_outbox` | Apply migration 003 using the existing migration runner                                                                     |
| Worker reports database failure      | Verify connection reachability and database readiness privately                                                             |
| Pending count increases              | Check worker process and mock endpoints; inspect sanitized error codes                                                      |
| Processing count persists            | Check expired leases; crashed work is reclaimable after 30 seconds                                                          |
| Dead count increases                 | Inspect classification and provider acceptance before considering a manual replay                                           |
| `lease_lost` appears                 | Another claimant owns the event; the stale worker cannot acknowledge                                                        |
| Browser unchanged after reconnect    | Check REST workflow state and existing authorized Socket.IO path; the provider outbox does not replay browser notifications |

`node --env-file=.env extension/run.mjs --stats` returns status counts and maximum attempts. Logs contain event IDs and error codes, never request bodies or database URLs. There is no new Prometheus collector, distributed trace or worker readiness probe. Queue age alerts, pruning, durable provider deduplication and a role-protected operator UI are future improvements.

For cleanup, stop only the new worker/mock processes or use `docker compose ... down` above. Do not use `down -v` on the original database stack. Do not drop migration 003 tables before deciding how pending events and receipt history should be retained.
