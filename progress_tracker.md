# Payload CMS Scale Test — Progress Tracker

This document tracks the execution of the Master Plan.

## Phase 0: Define success criteria
- [x] Pick scale checkpoint (1M)
- [x] Pick pass/fail thresholds
- [x] Create `criteria.md`

## Phase 1: Local dev & smoke test
- [x] **Stack setup:** Payload + Postgres + Azure Blob Storage adapter.
- [x] **Source Images:** Prepare 5-10 source images.
- [x] **Seeding script:** Write `seed-media.ts` (generates metadata, unique names, handles batches).
- [x] **Category structure:** Build collection for nested folders and update seed script to use them.
- [ ] **Test Scripts:**
  - [x] k6 script for API reads (`tests/load/api-reads.js`)
  - [x] k6 script for concurrent uploads (`tests/load/api-uploads.js`)
  - [x] Query/EXPLAIN ANALYZE scripts (`scripts/query-analysis.ts`)
  - [ ] Run all against local 5k-20k dataset to verify they work.

## Phase 2: Provision Azure
- [ ] Create `Standard_D4s_v5` VM (4 vCPU / 16GB). **Note: Postgres will run in Docker on this same VM** — no separate managed DB service needed.
- [ ] Keep VM in the same region as your Azure Blob Storage account to avoid egress costs.
- [ ] Set budget alerts in Azure Cost Management ($100 and $250 alerts).
- [ ] Deploy app stack on VM with Docker Compose (Payload + Postgres container).
- [ ] Verify `pg_stat_statements` is enabled on the Postgres container (already in the `docker-compose.yml` command flags).

## Phase 3: Seed to scale
- [ ] Seed to 1M and run Phase 4 suite.

## Phase 4: Test Suite (To be run at 1M checkpoint)
- [ ] Raw scale queries and UI tests.
- [ ] Folder organization queries.
- [ ] Search indexing (`tsvector` / GIN).
- [ ] Metadata queries.
- [ ] Upload concurrency tests.
- [ ] Storage abstraction metrics.
- [ ] API Performance (k6).

## Phase 5: Build comparison tables
- [ ] Compile baseline vs optimized performance data.

## Phase 6: Write the article
- [ ] Draft article.

## Phase 7: Teardown
- [ ] Delete VM and DB.
