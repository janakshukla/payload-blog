import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ALT_SUBJECTS = [
  'Minimal workspace',
  'Corporate meeting room',
  'Sunset over mountains',
  'Urban architecture',
  'Modern art gallery',
  'Abstract color gradient',
  'Close-up portrait',
  'Database server rack',
  'Tech gadget setup',
  'Nature trail',
]
const ALT_DESCRIPTIONS = [
  'with clean lighting',
  'showing sharp details',
  'in minimalist style',
  'with warm color tones',
  'captured in high definition',
  'with long exposure effect',
  'using soft focus background',
  'featuring dynamic shadows',
]

function generateAlt(): string {
  const subject = ALT_SUBJECTS[Math.floor(Math.random() * ALT_SUBJECTS.length)]
  const desc = ALT_DESCRIPTIONS[Math.floor(Math.random() * ALT_DESCRIPTIONS.length)]
  return `${subject} ${desc}.`
}

const TAGS_POOL = [
  'nature',
  'workspace',
  'profile',
  'banner',
  'abstract',
  'city',
  'technology',
  'art',
  'minimal',
  'corporate',
  'office',
  'design',
  'development',
  'database',
  'server',
  'testing',
]

function generateTags(): string {
  const count = Math.floor(Math.random() * 4) + 1 // 1 to 4 tags
  const tags: string[] = []
  while (tags.length < count) {
    const candidate = TAGS_POOL[Math.floor(Math.random() * TAGS_POOL.length)]
    if (!tags.includes(candidate)) {
      tags.push(candidate)
    }
  }
  return tags.join(', ')
}

function generateTimestamp(): Date {
  const now = Date.now()
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000
  return new Date(oneYearAgo + Math.random() * (now - oneYearAgo))
}

interface SourceImage {
  name: string
  buffer: Buffer
  mimetype: string
  ext: string
}

async function loadSourceImages(): Promise<SourceImage[]> {
  const imgsDir = path.resolve(__dirname, '../seed-data/imgs')
  const files = await fs.readdir(imgsDir)
  const sourceImages: SourceImage[] = []

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      continue
    }

    const filePath = path.join(imgsDir, file)
    const buffer = await fs.readFile(filePath)
    let mimetype = 'image/jpeg'
    if (ext === '.png') mimetype = 'image/png'
    else if (ext === '.webp') mimetype = 'image/webp'

    sourceImages.push({
      name: file,
      buffer,
      mimetype,
      ext,
    })
  }

  if (sourceImages.length === 0) {
    throw new Error(`No source images found in ${imgsDir}`)
  }

  console.log(`Loaded ${sourceImages.length} source images for rotation.`)
  return sourceImages
}

async function ensureCategories(payload: any): Promise<any[]> {
  console.log('Checking for existing categories...')
  const existing = await payload.find({
    collection: 'categories',
    limit: 10000,
  })

  if (existing.docs.length > 0) {
    console.log(`Found ${existing.docs.length} existing categories.`)
    return existing.docs.map((doc: any) => doc.id)
  }

  console.log('No categories found. Seeding a nested structure (3-4 levels deep, hundreds of folders)...')
  const ids: any[] = []

  // Level 1: Root categories (e.g. 10 roots)
  const rootCount = 10
  const rootDocs = []
  for (let i = 1; i <= rootCount; i++) {
    const doc = await payload.create({
      collection: 'categories',
      data: { name: `Folder Level 1 - ${i}` },
    })
    rootDocs.push(doc)
    ids.push(doc.id)
  }

  // Level 2: Subfolders (3 children per root)
  const lvl2Docs = []
  for (const root of rootDocs) {
    for (let j = 1; j <= 3; j++) {
      const doc = await payload.create({
        collection: 'categories',
        data: {
          name: `${root.name} -> Subfolder 2 - ${j}`,
          parent: root.id,
        },
      })
      lvl2Docs.push(doc)
      ids.push(doc.id)
    }
  }

  // Level 3: Subfolders (3 children per level 2)
  const lvl3Docs = []
  for (const lvl2 of lvl2Docs) {
    for (let k = 1; k <= 3; k++) {
      const doc = await payload.create({
        collection: 'categories',
        data: {
          name: `${lvl2.name} -> Subfolder 3 - ${k}`,
          parent: lvl2.id,
        },
      })
      lvl3Docs.push(doc)
      ids.push(doc.id)
    }
  }

  // Level 4: Subfolders (2 children per level 3)
  for (const lvl3 of lvl3Docs) {
    for (let l = 1; l <= 2; l++) {
      const doc = await payload.create({
        collection: 'categories',
        data: {
          name: `${lvl3.name} -> Subfolder 4 - ${l}`,
          parent: lvl3.id,
        },
      })
      ids.push(doc.id)
    }
  }

  console.log(`Successfully seeded ${ids.length} categories.`)
  return ids
}

async function getOrCreateAnchorImages(payload: any, sourceImages: SourceImage[]): Promise<any[]> {
  console.log('Checking for anchor images in database...')
  const existing = await payload.find({
    collection: 'media',
    where: {
      alt: {
        equals: 'ANCHOR_IMAGE_DO_NOT_DELETE',
      },
    },
    limit: 100,
  })

  if (existing.docs.length >= sourceImages.length) {
    console.log(`Found ${existing.docs.length} existing anchor images. Reusing them.`)
    return existing.docs
  }

  console.log(`Uploading ${sourceImages.length} anchor images to storage (once)...`)
  const anchors = []
  for (let i = 0; i < sourceImages.length; i++) {
    const img = sourceImages[i]
    const uuid = crypto.randomUUID()
    const newFilename = `anchor-${uuid}${img.ext}`
    const doc = await payload.create({
      collection: 'media',
      data: {
        alt: 'ANCHOR_IMAGE_DO_NOT_DELETE',
        tags: 'anchor',
      },
      file: {
        data: img.buffer,
        name: newFilename,
        mimetype: img.mimetype,
        size: img.buffer.length,
      },
    })
    anchors.push(doc)
  }
  console.log(`Successfully uploaded ${anchors.length} anchor images.`)
  return anchors
}

async function run() {
  const countArg = process.argv.find((arg) => arg.startsWith('--count='))
  const countIndex = process.argv.indexOf('--count')
  let totalCount = 50 // small default smoke test
  if (countArg) {
    totalCount = parseInt(countArg.split('=')[1], 10)
  } else if (countIndex !== -1 && process.argv[countIndex + 1]) {
    totalCount = parseInt(process.argv[countIndex + 1], 10)
  }

  const batchArg = process.argv.find((arg) => arg.startsWith('--batchSize='))
  const batchIndex = process.argv.indexOf('--batchSize')
  let batchSize = 50 // default batch size for safety, but can scale to 500-1000
  if (batchArg) {
    batchSize = parseInt(batchArg.split('=')[1], 10)
  } else if (batchIndex !== -1 && process.argv[batchIndex + 1]) {
    batchSize = parseInt(process.argv[batchIndex + 1], 10)
  }

  const noReuseArg = process.argv.includes('--no-reuse') || process.argv.includes('--upload')

  console.log(
    `Starting media seed: totalCount=${totalCount}, batchSize=${batchSize}, mode=${
      noReuseArg ? 'upload-concurrency (full upload)' : 'reuse-file (database references only)'
    }`
  )

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const sourceImages = await loadSourceImages()
  const categoryIds = await ensureCategories(payload)

  let anchorDocs: any[] = []
  if (!noReuseArg) {
    anchorDocs = await getOrCreateAnchorImages(payload, sourceImages)
  }

  const globalStartTime = performance.now()
  let totalInserted = 0

  for (let i = 0; i < totalCount; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, totalCount - i)
    const batchPromises = []

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j
      const alt = generateAlt()
      const tags = generateTags()
      const capturedAt = generateTimestamp()
      const category = categoryIds[Math.floor(Math.random() * categoryIds.length)]

      if (noReuseArg) {
        const img = sourceImages[index % sourceImages.length]
        const uuid = crypto.randomUUID()
        const newFilename = `img-${uuid}${img.ext}`
        batchPromises.push(
          payload.create({
            collection: 'media',
            data: {
              alt,
              tags,
              capturedAt: capturedAt.toISOString(),
              category,
            },
            file: {
              data: img.buffer,
              name: newFilename,
              mimetype: img.mimetype,
              size: img.buffer.length,
            },
          })
        )
      } else {
        // Generate a unique filename to satisfy the database unique constraint,
        // but copy all other metrics from the anchor. Since we call payload.db.create,
        // no actual file upload to Azure occurs during seeding.
        const anchor = anchorDocs[index % anchorDocs.length]
        const uuid = crypto.randomUUID()
        const ext = path.extname(anchor.filename)
        const newFilename = `seeded-${uuid}${ext}`

        // Construct a unique URL path by replacing the original filename
        const lastSlash = anchor.url.lastIndexOf('/')
        const newUrl = lastSlash !== -1 
          ? `${anchor.url.substring(0, lastSlash)}/${newFilename}`
          : `/media/${newFilename}`

        batchPromises.push(
          payload.db.create({
            collection: 'media',
            data: {
              alt,
              tags,
              capturedAt: capturedAt.toISOString(),
              category,
              filename: newFilename,
              filesize: anchor.filesize,
              mimeType: anchor.mimeType,
              width: anchor.width,
              height: anchor.height,
              url: newUrl,
              sizes: anchor.sizes,
            },
          })
        )
      }
    }

    const batchStartTime = performance.now()
    await Promise.all(batchPromises)
    const batchEndTime = performance.now()

    totalInserted += currentBatchSize
    const batchDuration = (batchEndTime - batchStartTime) / 1000
    const globalDuration = (batchEndTime - globalStartTime) / 1000
    const batchThroughput = currentBatchSize / batchDuration
    const overallThroughput = totalInserted / globalDuration
    const memory = process.memoryUsage()

    console.log(
      `[PROGRESS] Seeded ${totalInserted}/${totalCount} (${Math.round(
        (totalInserted / totalCount) * 100
      )}%) | Batch Time: ${batchDuration.toFixed(2)}s (${batchThroughput.toFixed(
        1
      )}/s) | Avg Rate: ${overallThroughput.toFixed(1)}/s | Heap: ${(
        memory.heapUsed /
        1024 /
        1024
      ).toFixed(1)} MB`
    )
  }

  const globalEndTime = performance.now()
  const totalDuration = (globalEndTime - globalStartTime) / 1000
  console.log('--------------------------------------------------')
  console.log('Seeding completed successfully!')
  console.log(`Total Media Uploads: ${totalInserted}`)
  console.log(`Total Time Elapsed: ${totalDuration.toFixed(2)} seconds`)
  console.log(`Average Throughput: ${(totalInserted / totalDuration).toFixed(2)} uploads/second`)
  console.log('--------------------------------------------------')

  process.exit(0)
}

run().catch((err) => {
  console.error('Seeding failed:', err)
  if (err && typeof err === 'object' && 'data' in err) {
    console.error('Error details:', JSON.stringify(err.data, null, 2))
  }
  process.exit(1)
})
