import http from 'k6/http';
import { sleep, check } from 'k6';
import encoding from 'k6/encoding';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Override target VU counts via env: k6 run -e VUS_MAX=200 api-uploads.js
const VUS_MAX = __ENV.VUS_MAX ? parseInt(__ENV.VUS_MAX) : 50;
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '10s', target: 10 },          // Ramp-up: 10 concurrent uploads
    { duration: '30s', target: VUS_MAX },      // Load: hit target concurrency (default 50)
    { duration: '10s', target: 100 },          // Spike: push to 100
    { duration: '10s', target: 0 },            // Ramp-down
  ],
  thresholds: {
    // Pass/fail gates that map to criteria.md:
    http_req_failed:   ['rate<0.01'],           // Upload success rate > 99%
    http_req_duration: ['p(95)<2000'],          // Upload p95 latency < 2000ms
  },
};

// ---------------------------------------------------------------------------
// Minimal but realistic 1x1 transparent PNG (69 bytes, valid file header).
// Using a hardcoded small image keeps the test self-contained with no
// external file dependencies. For measuring upload latency, the bottleneck
// is DB + storage round-trip, not the image size.
// ---------------------------------------------------------------------------
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const ALT_SUBJECTS = [
  'Minimal workspace', 'Corporate meeting room', 'Sunset over mountains',
  'Urban architecture', 'Modern art gallery', 'Abstract color gradient',
  'Close-up portrait', 'Database server rack', 'Tech gadget setup', 'Nature trail',
];
const ALT_DESCRIPTIONS = [
  'with clean lighting', 'showing sharp details', 'in minimalist style',
  'with warm color tones', 'captured in high definition', 'with long exposure effect',
  'using soft focus background', 'featuring dynamic shadows',
];
const TAGS_POOL = [
  'nature', 'workspace', 'profile', 'banner', 'abstract', 'city',
  'technology', 'art', 'minimal', 'corporate', 'office', 'design',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAlt() {
  return `${randomItem(ALT_SUBJECTS)} ${randomItem(ALT_DESCRIPTIONS)}.`;
}

function randomTags() {
  const count = Math.floor(Math.random() * 3) + 1;
  const tags = new Set();
  while (tags.size < count) tags.add(randomItem(TAGS_POOL));
  return [...tags].join(', ');
}

// ---------------------------------------------------------------------------
// setup() — fetch category IDs once so each VU can assign media to a real folder
// ---------------------------------------------------------------------------
export function setup() {
  console.log('Fetching category IDs for upload test...');
  const res = http.get(`${BASE_URL}/api/categories?limit=500`);
  let categoryIds = [];
  try {
    const data = res.json();
    if (data && Array.isArray(data.docs)) {
      categoryIds = data.docs.map((d) => d.id);
    }
  } catch (e) {
    console.error('Could not fetch categories:', e);
  }
  console.log(`Setup complete. ${categoryIds.length} categories available.`);
  return { categoryIds };
}

// ---------------------------------------------------------------------------
// default() — executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
  const categoryIds = data.categoryIds;
  const category = categoryIds.length > 0 ? randomItem(categoryIds) : null;

  // Build a unique filename so each upload doesn't collide in storage
  const uuid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `load-test-${uuid}.png`;

  // Decode our tiny PNG from base64 to binary for the multipart body
  const imageBytes = encoding.b64decode(TINY_PNG_B64, 'std', 's');

  // Build the multipart form-data payload.
  // Payload CMS REST API expects non-file fields as a JSON string under "_payload".
  const payloadData = {
    alt: randomAlt(),
    tags: randomTags(),
  };
  if (category) {
    payloadData['category'] = category;
  }

  const formData = {
    file: http.file(imageBytes, filename, 'image/png'),
    _payload: JSON.stringify(payloadData),
  };

  const res = http.post(`${BASE_URL}/api/media`, formData, {
    tags: { name: 'Upload Media' },
  });

  check(res, {
    'upload status is 201': (r) => r.status === 201,
    'response has id':      (r) => {
      try { return !!r.json().doc?.id; } catch { return false; }
    },
  });

  // Brief pause between uploads per VU (0–200ms) to avoid pure hammer mode
  sleep(Math.random() * 0.2);
}
