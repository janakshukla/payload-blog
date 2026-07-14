# Azure VM Setup & Execution Guide

A step-by-step guide for setting up and running the Payload CMS scale test on an Azure VM.

---

## Part 1: Create the Azure VM

1. Go to **Azure Portal → Virtual Machines → Create**
2. Pick these settings:
   - **Image:** Ubuntu 24.04 LTS
   - **Size:** `Standard_D4s_v5` (4 vCPU / 16 GB RAM)
   - **Region:** Same region as your Azure Blob Storage account (check your storage account's "Overview" page for its region)
   - **Authentication:** SSH public key (recommended) or password
   - **Inbound ports:** Allow SSH (22) and HTTP (3000) — you'll need port 3000 to view the Payload Admin UI from your browser
3. Once created, note the **Public IP address** from the VM's Overview page.

---

## Part 2: SSH Into the VM

```bash
ssh <your-username>@<vm-public-ip>
```

---

## Part 3: Install Prerequisites on the VM

Run these commands one by one:

### 3.1 Update the system
```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2 Install Docker
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to the docker group so you don't need sudo
sudo usermod -aG docker $USER

# Apply group change (or log out and back in)
newgrp docker

# Verify
docker --version
```

### 3.3 Install Docker Compose (v2 plugin)
```bash
sudo apt install docker-compose-plugin -y

# Verify
docker compose version
```

### 3.4 Install Node.js (v20) and pnpm
```bash
# Install Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
sudo npm install -g pnpm

# Verify
node --version
pnpm --version
```

### 3.5 Install k6 (for load testing)
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update
sudo apt install k6 -y

# Verify
k6 version
```

---

## Part 4: Clone Your Repo & Configure

### 4.1 Clone the project
```bash
git clone https://github.com/janakshukla/payload-blog.git
cd payload-blog
```

### 4.2 Install dependencies
```bash
pnpm install
```

### 4.3 Create the `.env` file
```bash
nano .env
```
Paste the following (update with your actual Azure Blob Storage credentials):
```env
DATABASE_URL=postgresql://payload:payload@localhost:5432/payload
PAYLOAD_SECRET=e50ff311c09ba70a9c57e517

AZURE_STORAGE_ALLOW_CONTAINER_CREATE=true
AZURE_STORAGE_ACCOUNT_BASEURL=https://payloadblog.blob.core.windows.net/
AZURE_STORAGE_CONNECTION_STRING=<your-connection-string>
AZURE_STORAGE_CONTAINER_NAME=payload-media
DISABLE_EXTERNAL_STORAGE=false
```
Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

### 4.4 Create results directories
```bash
mkdir -p results/1M
```

---

## Part 5: Start the Stack

### 5.1 Start Postgres only (for seeding)
```bash
docker compose up -d postgres
```
Verify it's running:
```bash
docker compose ps
```
You should see the postgres container with status `Up`.

### 5.2 Build the Payload app (required before first run)
```bash
pnpm build
```
> This compiles the Next.js app. It takes a few minutes on the first run.

---

## Part 6: Seed 1 Million Records

Run the seeding script directly on the VM (NOT from your local machine):
```bash
pnpm seed:media --count=1000000 --batchSize=1000 2>&1 | tee results/1M/seeding-performance.txt
```
> The `| tee` part saves the output to a file AND shows it on screen simultaneously.

**⏱ Expected time:** ~15-30 minutes depending on VM performance.

**📸 SCREENSHOT:** When it finishes, capture the terminal showing the final summary (total time, average throughput).

---

## Part 7: Run Baseline Query Analysis (BEFORE Indexes)

```bash
pnpm test:query-analysis 2>&1 | tee results/1M/query-analysis-baseline.txt
```

**📸 SCREENSHOT:** Capture the EXPLAIN ANALYZE output for the recursive folder query and the alt text filter query.

---

## Part 8: Add Database Indexes

Connect to the Postgres container:
```bash
docker exec -it $(docker compose ps -q postgres) psql -U payload -d payload
```

Run these SQL commands inside the psql shell:
```sql
-- 1. Index on category relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_category ON "media"(category);

-- 2. Index on captured_at date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_captured_at ON "media"("captured_at");

-- 3. Full-text search setup
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE "media" SET search_vector = to_tsvector('english', coalesce(alt, '') || ' ' || coalesce(tags, ''));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_search_vector ON "media" USING GIN(search_vector);

-- 4. Check table and index sizes (save this output!)
\dt+ media
\di+ idx_media*

-- 5. Exit psql
\q
```

**📸 SCREENSHOT:** Capture the `\dt+` and `\di+` output showing table/index sizes.

---

## Part 9: Run Optimized Query Analysis (AFTER Indexes)

```bash
pnpm test:query-analysis 2>&1 | tee results/1M/query-analysis-optimized.txt
```

**📸 SCREENSHOT:** Compare the EXPLAIN ANALYZE times side-by-side with the baseline file.

---

## Part 10: Start Payload & Run Load Tests

### 10.1 Start the Payload server
```bash
pnpm start &
```
> The `&` runs it in the background. Wait ~10 seconds for it to boot, then verify:
```bash
curl -s http://localhost:3000/api/media?limit=1 | head -c 200
```
You should see JSON output with a `docs` array.

### 10.2 Run API Read Load Test
```bash
k6 run tests/load/api-reads.js 2>&1 | tee results/1M/reads-k6-output.txt
```

**📸 SCREENSHOT:** Capture the k6 summary table showing p95 latency and success rate.

### 10.3 Run Upload Concurrency Load Test
```bash
k6 run tests/load/api-uploads.js 2>&1 | tee results/1M/uploads-k6-output.txt
```

**📸 SCREENSHOT:** Capture the k6 summary table showing p95 latency and success rate.

---

## Part 11: Admin UI Validation (From Your Local Machine)

1. Open your browser on your **local computer** (not the VM).
2. Navigate to: `http://<vm-public-ip>:3000/admin`
3. Create an admin user if prompted.
4. Go to the **Media** collection.
5. Open **Chrome DevTools** (`F12`) → **Network** tab.
6. Reload the page.

**📸 SCREENSHOT:** Capture the Admin UI showing the media list with the total count (should show ~1,000,000) alongside the DevTools Network panel showing the API response time.

---

## Part 12: Download Results to Your Local Machine

From your **local machine**, run:
```bash
scp -r <your-username>@<vm-public-ip>:~/payload-blog/results/ ./results-from-vm/
```

---

## Part 13: Teardown (When Done)

### Stop Payload
```bash
# Find and kill the background Payload process
kill $(lsof -t -i:3000)
```

### Stop Docker containers
```bash
docker compose down
```

### Deallocate the VM (from Azure Portal)
Go to **Azure Portal → Your VM → Stop (Deallocate)**.

> ⚠️ **Important:** "Stop" from inside the OS still bills you. You must click **"Stop"** in the Azure Portal to fully deallocate and stop billing.

---

## Quick Command Reference

| Step | Command | Where |
|------|---------|-------|
| Start DB | `docker compose up -d postgres` | VM |
| Seed 1M | `pnpm seed:media --count=1000000 --batchSize=1000` | VM |
| Query baseline | `pnpm test:query-analysis` | VM |
| Add indexes | `docker exec -it ... psql -U payload -d payload` | VM |
| Query optimized | `pnpm test:query-analysis` | VM |
| Start Payload | `pnpm start &` | VM |
| Read load test | `k6 run tests/load/api-reads.js` | VM |
| Upload load test | `k6 run tests/load/api-uploads.js` | VM |
| Admin UI check | Browser → `http://<vm-ip>:3000/admin` | Local |
| Download results | `scp -r user@vm:~/payload-blog/results/ ./` | Local |
