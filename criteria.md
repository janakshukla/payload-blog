# Success Criteria for Payload CMS Scale Test

This document defines the pass/fail thresholds for our scale test experiment. We will judge Payload CMS against these criteria at various data scales.

## Scale Checkpoints
We will perform our test suite at the following media document volumes:
- 1,000,000 (1M) documents
- 5,000,000 (5M) documents
- 10,000,000 (10M) documents

## Pass/Fail Thresholds

To consider Payload CMS "successful" at handling a large media library, it must meet the following performance benchmarks at the **5M records** scale (with reasonable degradation allowed up to 10M):

### 1. API Read Performance
- **List Endpoint (p95 latency):** < 300ms
  - The standard REST/GraphQL list query must return quickly to ensure smooth admin UI experiences.
- **Search Query (p95 latency):** < 500ms
  - Filtering by `alt` text or `tags` with an index should return in under half a second.

### 2. Upload Concurrency
- **Upload Success Rate:** > 99%
  - When sustained at 50 concurrent uploads, the system should not drop or fail uploads due to database locks or memory limits.
- **Upload Latency (p95):** < 2000ms
  - An individual upload should resolve within 2 seconds under high load.

### 3. Folder Queries
- **Shallow Directory Query (p95):** < 300ms
  - Fetching the contents of a specific folder should be fast, regardless of total system scale.

### 4. Admin UI Experience
- **First Load Time:** < 2000ms
  - Navigating to the Media collection in the Admin panel should not freeze the browser or timeout.

### 5. Deep Offset Pagination
- **Page 5000 query (p95 latency):** < 2000ms
  - When querying deep pages (e.g., `?page=5000&limit=20`) Postgres must execute `OFFSET 100000`. This is a known degradation point; the threshold is intentionally lenient (2s) because we *expect* degradation — we want to *measure* it, not just fail blindly.
  - **Documenting the degradation curve** (page 1 vs. page 100 vs. page 5000) is one of the most interesting findings for the article.

*Note: These metrics will be measured against our Azure deployment (Standard_D4s_v5 VM running Postgres in Docker).*
