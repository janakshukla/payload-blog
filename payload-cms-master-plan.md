# Master Plan: Can Payload CMS Efficiently Serve Large Media Libraries?

A full, followable plan from setup to published article. Decisions already locked in based on earlier planning: **Azure Blob Storage** as primary storage, **Postgres** as the DB, **local smoke test → Azure VM for real-scale runs**, images duplicated with unique keys + varied metadata.

---

## Phase 0 — Define success criteria (before writing any code)

- [ ] Pick scale checkpoint: **1M** media documents
- [ ] Pick pass/fail thresholds you'll judge against, e.g.:
  - API list endpoint p95 < 300ms
  - Search query < 500ms at 1M records
  - Upload success rate > 99% at 50 concurrent uploads
- [ ] Write these down in a `criteria.md` — you'll quote this in the article intro and again in the verdict, so the piece reads like a real experiment, not a vibe check

---

## Phase 1 — Local dev & smoke test (free, do this first, don't skip)

Goal: get every script working correctly at small scale (5k–20k records) before you touch a paid VM.

### 1.1 Stack
- Payload CMS (latest 3.x) + `@payloadcms/db-postgres`
- Local Postgres (Docker)
- Point storage directly at your **Azure Blob Storage** container using `@payloadcms/storage-azure` — no need for MinIO since you're going straight to the real storage target.
- `pg_stat_statements` extension enabled on Postgres from the start

### 1.2 Prepare source images
- [ ] Gather 5–10 source images at a few sizes (e.g. ~20KB, ~200KB, ~2MB) — not one, not thousands, just enough for realistic size variance
- [ ] Confirm they're royalty-free / yours to use (unsplash/pexels or your own photos)

### 1.3 Write the seeding script (Node.js, outside Payload admin UI)
- [ ] Rotate randomly through your 5–10 source images
- [ ] Generate a **unique filename/key per upload** (e.g. `img-{uuid}.jpg`) — critical, prevents silent overwrites
- [ ] Randomize metadata per record independently of the image: alt text, tags, EXIF-like custom fields, upload timestamp, folder/category assignment
- [ ] Batch insert via Payload Local API (`payload.create()`) in batches of 500–1000
- [ ] Log progress every 1k–10k records with timestamps (you'll use this later to plot insert throughput vs. volume)

### 1.4 Build the folder/category structure
- [ ] Create a nested category collection, 3–4 levels deep, hundreds of folders
- [ ] Randomly assign media to folders as you seed (not retrofitted after)

### 1.5 Write your test scripts now, run them small
- [ ] k6 script for concurrent uploads
- [ ] k6 script for API list/get/filter endpoints
- [ ] Query scripts for metadata filters and folder queries (with `EXPLAIN ANALYZE`)
- [ ] Run all of them against your 5k–20k local dataset — confirm they run clean, output valid JSON/CSV, and don't crash. **This is the whole point of Phase 1**: find bugs here, not on the clock in Azure.

Once everything runs clean locally → move to Phase 2. Don't run a local million-record test; that's what the VM is for.

---

## Phase 2 — Provision Azure

### 2.1 Resources to create
- [ ] **VM**: `Standard_D4s_v5` (4 vCPU / 16GB) — pay-as-you-go, stoppable
- [ ] **Azure Database for PostgreSQL – Flexible Server**, General Purpose tier, similar vCore count — also stoppable
- [ ] Keep VM and Postgres server in the **same region** to avoid cross-resource latency skewing your numbers
- [ ] Confirm your **Azure Blob Storage** container and connection string are ready — same container you dev'd against, or a fresh one for clean numbers.

### 2.2 Cost control setup (do this before running anything heavy)
- [ ] Set a budget alert in Azure Cost Management (e.g. alert at $100, $250)
- [ ] **Stop/deallocate the VM and Postgres server whenever you're not actively testing** — this is the single biggest lever on your bill; both support stop/start
- [ ] Note: Azure Blob Storage does have egress costs. Make sure your VM is in the same region as your storage account to keep bandwidth charges during read-heavy tests to a minimum.

### 2.3 Deploy
- [ ] Docker on the VM: Payload container + Prometheus/Grafana (Postgres exporter + Node metrics)
- [ ] Point Payload's storage adapter at Azure Blob Storage using the connection string and `@payloadcms/storage-azure`.
- [ ] Confirm `pg_stat_statements` is enabled on the Flexible Server instance
- [ ] Copy your seeding + k6 scripts from local — same scripts, same test, different environment (this is what makes the comparison valid)

---

## Phase 3 — Seed to scale

- [ ] Run seeding script to checkpoint (1M records) — log throughput over time as the table grows
- [ ] Run full Phase 4 test suite (below) at this checkpoint, save all raw output to a `results/1M/` folder
- [ ] Stop VM/Postgres between sessions if there's a time gap

---

## Phase 4 — The test suite (run this at every checkpoint)

### 4.1 Raw scale handling
- [ ] Full collection count query time
- [ ] DB table size on disk (`\dt+`) and index sizes (`\di+`)
- [ ] Admin UI list view load time (capture via browser DevTools → export HAR as proof)

### 4.2 Folder organization
- [ ] Query time: "all media in folder X" at shallow vs. deep nesting
- [ ] Query time: recursive "folder X + subfolders"
- [ ] `EXPLAIN ANALYZE` on both — screenshot the query plan, check index usage

### 4.3 Search indexing
- [ ] Baseline: Payload's default `where` filters on title/alt text
- [ ] Add Postgres full-text search (`tsvector` + GIN index) — direct before/after comparison
- [ ] Optional stretch: bolt on Meilisearch/Typesense, report the delta

### 4.4 Metadata queries
- [ ] Multi-field filters (e.g. width > X AND tag = Y AND uploadedAfter = Z)
- [ ] Indexed vs. non-indexed field comparison with `EXPLAIN ANALYZE` cost numbers
- [ ] Offset pagination performance: page 1 vs. deep pages (e.g. page 5000) — likely to show real degradation, good finding

### 4.5 Upload concurrency
- [ ] k6/autocannon at 10, 50, 100, 200 concurrent uploads
- [ ] Capture: success rate, p50/p95/p99 latency, error types, CPU/memory on Payload process during the run (Grafana)
- [ ] If feasible: compare direct-to-server upload vs. SAS URL direct-to-Azure Blob upload — strong technical differentiator for the article

### 4.6 Storage abstraction
- [ ] Run upload/read tests against Azure Blob Storage as primary.
- [ ] Evaluate the performance of Payload's storage adapter and any measurable overhead during high concurrency.

### 4.7 API performance
- [ ] k6 against REST list/get/filter endpoints at each checkpoint
- [ ] Compare REST vs. GraphQL if enabled
- [ ] Cold vs. warm (cached) response times

**After every test**: save raw JSON/CSV output + a screenshot of the relevant Grafana panel or `EXPLAIN` plan into `results/{checkpoint}/{test-name}/`. This is your proof — don't rely on memory when writing later.

---

## Phase 5 — Build comparison tables

- [ ] Baseline vs. Optimized table: same metric before and after database indexing at 1M (shows index speedup)
- [ ] Local-dev vs. Azure-VM table (sanity check, optional to publish)
- [ ] Storage performance table (from 4.6)
- [ ] Indexed vs. non-indexed query table (from 4.3/4.4)

---

## Phase 6 — Write the article (your own words, no AI)

1. **Intro** — the question, why it matters, real use case
2. **Methodology** — hardware specs, dataset generation method (be honest about duplicated images + unique keys + randomized metadata), tools used, scale checkpoints
3. **Results by section** — one section per Phase 4 test area, each with a table/chart + your interpretation
4. **Storage performance** — Azure Blob Storage findings and adapter overhead
5. **Where it struggled** — call out real pain points (offset pagination, indexes you had to add manually, anything that surprised you) — this is what makes it a case study instead of marketing copy
6. **Verdict** — answer your Phase 0 criteria directly, with numbers
7. **Appendix** — link your seeding/k6 scripts (e.g. a gist) so it's reproducible

---

## Phase 7 — Teardown

- [ ] Delete/deallocate the VM and Postgres Flexible Server
- [ ] Decide whether to keep or empty the Azure Blob container (storage is cheap, but no reason to pay for it once the article's published)
- [ ] Archive your `results/` folder somewhere permanent — you'll want it if anyone questions the numbers later

---

## Quick reference: cost control checklist

- [ ] VM and Postgres server stopped by default, only running during active test sessions
- [ ] Budget alerts set in Azure Cost Management
- [ ] VM and Storage kept in the same Azure region to avoid cross-region bandwidth egress costs
- [ ] Unique image keys confirmed in seeding script before any large run (avoid wasted re-runs from silent overwrites)
