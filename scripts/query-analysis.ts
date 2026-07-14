/**
 * query-analysis.js — Phase 1.5 / Phase 4 query script
 *
 * Purpose: Run targeted EXPLAIN ANALYZE queries against Postgres to measure
 * real query plans and costs for the scenarios defined in the master plan.
 *
 * Usage (requires DATABASE_URL in env):
 *   node --import=tsx/esm scripts/query-analysis.ts
 *
 * You can also pipe the output to a file for archiving:
 *   node --import=tsx/esm scripts/query-analysis.ts > results/1M/query-analysis.txt
 */

import 'dotenv/config'
import pg from 'pg'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function runExplain(
  client: pg.Client,
  label: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  console.log('\n' + '='.repeat(70))
  console.log(`TEST: ${label}`)
  console.log('='.repeat(70))
  console.log(`SQL:\n  ${sql.replace(/\n/g, '\n  ')}`)
  if (params.length > 0) console.log(`PARAMS: ${JSON.stringify(params)}`)

  const start = performance.now()
  const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, params)
  const duration = (performance.now() - start).toFixed(2)

  console.log(`\nEXPLAIN ANALYZE output (actual runtime: ${duration}ms):\n`)
  for (const row of res.rows) {
    // pg returns each line as a separate row under the key "QUERY PLAN"
    const key = Object.keys(row)[0]
    console.log(row[key])
  }
}

async function countRows(client: pg.Client, table: string): Promise<number> {
  const res = await client.query(`SELECT COUNT(*) as c FROM "${table}"`)
  return parseInt(res.rows[0].c, 10)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  console.log('Connected to Postgres.')

  // -----------------------------------------------------------------------
  // 0. Table sizes at time of run
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(70))
  console.log('TABLE SIZES')
  console.log('='.repeat(70))
  const sizeRes = await client.query(`
    SELECT
      relname AS table,
      pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
      pg_size_pretty(pg_relation_size(oid))        AS table_size,
      pg_size_pretty(pg_total_relation_size(oid) - pg_relation_size(oid)) AS index_size,
      reltuples::bigint AS estimated_rows
    FROM pg_class
    WHERE relkind = 'r'
      AND relname IN ('media', 'categories')
    ORDER BY pg_total_relation_size(oid) DESC
  `)
  console.table(sizeRes.rows)

  const mediaCount = await countRows(client, 'media')
  console.log(`\nExact media row count: ${mediaCount.toLocaleString()}`)

  // -----------------------------------------------------------------------
  // 1. Full count query
  // -----------------------------------------------------------------------
  await runExplain(client, 'Full COUNT(*) on media table', `SELECT COUNT(*) FROM "media"`)

  // -----------------------------------------------------------------------
  // 2. Simple paginated list — page 1 (baseline)
  // -----------------------------------------------------------------------
  await runExplain(
    client,
    'Paginated list — page 1 (LIMIT 20 OFFSET 0)',
    `SELECT id, filename, alt, tags, "capturedAt", category FROM "media" ORDER BY "createdAt" DESC LIMIT 20 OFFSET 0`,
  )

  // -----------------------------------------------------------------------
  // 3. Deep offset pagination — page 5000 (OFFSET 100000)
  // -----------------------------------------------------------------------
  await runExplain(
    client,
    'Paginated list — page 5000 (LIMIT 20 OFFSET 100000) — EXPECT HIGH COST',
    `SELECT id, filename, alt, tags, "capturedAt", category FROM "media" ORDER BY "createdAt" DESC LIMIT 20 OFFSET 100000`,
  )

  // -----------------------------------------------------------------------
  // 4. Tag filter — using LIKE (no full-text index, baseline)
  // -----------------------------------------------------------------------
  await runExplain(
    client,
    'Filter by tag — tags LIKE (no index, baseline)',
    `SELECT id, filename, alt, tags FROM "media" WHERE tags LIKE $1 LIMIT 20`,
    ['%nature%'],
  )

  // -----------------------------------------------------------------------
  // 5. Alt text filter — ILIKE (no full-text index, baseline)
  // -----------------------------------------------------------------------
  await runExplain(
    client,
    'Filter by alt text — alt ILIKE (no index, baseline)',
    `SELECT id, filename, alt FROM "media" WHERE alt ILIKE $1 LIMIT 20`,
    ['%workspace%'],
  )

  // -----------------------------------------------------------------------
  // 6. Folder query — shallow (single category)
  // -----------------------------------------------------------------------
  // Get a real category ID to use
  const catRes = await client.query(`SELECT id FROM "categories" LIMIT 1`)
  const categoryId = catRes.rows[0]?.id
  if (categoryId) {
    await runExplain(
      client,
      'Folder query — shallow (single category, direct relationship)',
      `SELECT id, filename, alt FROM "media" WHERE category = $1 LIMIT 20`,
      [categoryId],
    )
  }

  // -----------------------------------------------------------------------
  // 7. Folder query — recursive (category + all subfolders)
  // Simulates what a UI "Show all in folder including subfolders" feature would run
  // -----------------------------------------------------------------------
  if (categoryId) {
    await runExplain(
      client,
      'Folder query — recursive (category + all descendants via CTE)',
      `
        WITH RECURSIVE folder_tree AS (
          SELECT id FROM "categories" WHERE id = $1
          UNION ALL
          SELECT c.id FROM "categories" c
          INNER JOIN folder_tree ft ON c.parent = ft.id
        )
        SELECT m.id, m.filename, m.alt
        FROM "media" m
        WHERE m.category IN (SELECT id FROM folder_tree)
        LIMIT 50
      `,
      [categoryId],
    )
  }

  // -----------------------------------------------------------------------
  // 8. Multi-field metadata filter (index vs no-index comparison setup)
  // -----------------------------------------------------------------------
  await runExplain(
    client,
    'Multi-field filter — tags + capturedAt range (no composite index, baseline)',
    `
      SELECT id, filename, alt, tags, "capturedAt"
      FROM "media"
      WHERE tags LIKE $1
        AND "capturedAt" > $2
      ORDER BY "capturedAt" DESC
      LIMIT 20
    `,
    ['%tech%', new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString()],
  )

  // -----------------------------------------------------------------------
  // 9. Index suggestions (printed, not executed — you run these manually)
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(70))
  console.log('RECOMMENDED INDEXES TO ADD (run these manually, then re-run this script)')
  console.log('='.repeat(70))
  console.log(`
-- Index on category (relationship field — most common filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_category ON "media"(category);

-- Index on capturedAt (range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_captured_at ON "media"("capturedAt");

-- GIN index for full-text search on alt + tags (combined tsvector)
-- Run this AFTER baseline measurements to compare before/after
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE "media" SET search_vector = to_tsvector('english', coalesce(alt, '') || ' ' || coalesce(tags, ''));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_search_vector ON "media" USING GIN(search_vector);
  `)

  await client.end()
  console.log('\nQuery analysis complete. Save this output to results/{checkpoint}/query-analysis.txt')
}

run().catch((err) => {
  console.error('Query analysis failed:', err)
  process.exit(1)
})
