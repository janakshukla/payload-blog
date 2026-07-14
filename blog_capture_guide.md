# Step-by-Step Testing & Blog Capture Guide (1M Scale)

This guide details every command you need to run, in order, from your local machine to the Azure VM checkpoint. It also highlights exactly when to save logs and take screenshots for your article.

---

## Folder Setup (Run first on VM / local)
Before running tests, create your results folders so you have a place to save everything:
```bash
mkdir -p results/local
mkdir -p results/1M
```

---

## Step 1: The Local Smoke Test (Verify scripts work)
Run these commands locally to make sure the environment and tests are functioning properly before moving to Azure.

### 1.1 Start Database (Local Host Mode)
For local testing, it is easiest to run **only the database** in Docker and run Payload on your host machine. Start Postgres:
```bash
docker compose up -d postgres
```

### 1.2 Seed 5,000 Records
Run a quick seed command using your local Node environment:
```bash
pnpm seed:media --count=5000 --batchSize=100
```
* **[SAVE LOG]:** Save the output of the console showing the average throughput (e.g., `80.5 uploads/second`).

### 1.3 Start Payload & Run Load Tests
Start the Payload server locally on your machine:
```bash
pnpm dev
```
In a **separate terminal window**, run the load tests:
```bash
# Run read test
pnpm test:load-reads

# Run upload test
pnpm test:load-uploads
```
* **[SAVE LOG]:** Check that k6 finishes with a green checkmark indicating `<1%` failure rates.

### 1.4 Run Query Analysis
```bash
pnpm test:query-analysis > results/local/query-analysis.txt
```
Verify the file is generated and contains the recursive CTE output.

---

## Step 2: The 1M Record Azure Checkpoint
Once deployed on the Azure VM:

### 2.1 Start the Entire Stack via Docker Compose
On the production VM, you want to run the whole stack (Postgres + Payload) in the background:
```bash
docker compose up -d
```
Verify both containers are running (`docker compose ps`).

### 2.2 Seed to 1 Million
Execute the seeding script on the VM (inside the directory where the code is located):
```bash
pnpm seed:media --count=1000000 --batchSize=1000
```
* **[TAKE SCREENSHOT]:** Capture your terminal showing the final `Seeding completed successfully!` summary box showing the average throughput rates at 1M.
* **[SAVE LOG]:** Save the entire terminal output to `results/1M/seeding-performance.txt`.

### 2.3 Baseline Query Analysis
Run queries BEFORE adding custom indexes:
```bash
pnpm test:query-analysis > results/1M/query-analysis-baseline.txt
```

### 2.3 Apply Database Optimizations
Log into your Postgres container:
```bash
docker exec -it <postgres-container-id> psql -U payload -d payload
```
Run the optimization SQL:
```sql
-- Index on category relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_category ON "media"(category);

-- Index on capturedAt range filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_captured_at ON "media"("capturedAt");

-- GIN index for full-text search
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_search_vector ON "media" USING GIN(search_vector);
```
Wait for indexing to complete, then update search vectors:
```sql
UPDATE "media" SET search_vector = to_tsvector('english', coalesce(alt, '') || ' ' || coalesce(tags, '')) WHERE search_vector IS NULL;
```

### 2.4 Optimized Query Analysis
Run queries AFTER adding indexes to compare execution plans:
```bash
pnpm test:query-analysis > results/1M/query-analysis-optimized.txt
```
* **[TAKE SCREENSHOT]:** Side-by-side terminal screenshots comparing the `EXPLAIN ANALYZE` execution times of the "Recursive CTE folder query" and "Alt text search query" before and after indexes were added.

### 2.5 Run Load Tests
Run these on the VM pointing to localhost (ensures you measure VM capacity, not home network constraints):
```bash
# Run reads and save summary
pnpm test:load-reads --summary-export=results/1M/reads-k6-summary.json

# Run uploads and save summary
pnpm test:load-uploads --summary-export=results/1M/uploads-k6-summary.json
```
* **[TAKE SCREENSHOT]:** The k6 terminal output tables showing the p95 latency results for both read and upload tests.

### 2.6 Admin UI Validation
Open your browser and navigate to the VM's public IP Payload Media Admin panel. Open DevTools (`F12`), head to the **Network** tab, and reload the page.
* **[TAKE SCREENSHOT]:** A screenshot showing the Payload Admin panel listing the first page of media (with the `1,000,000` total count visible) next to the Chrome DevTools network panel highlighting the `GET /api/media` response time.
* **[TAKE SCREENSHOT]:** Run `\dt+` and `\di+` in psql to show the physical disk size of tables/indexes. Screenshot the results.
