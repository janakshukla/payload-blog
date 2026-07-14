import http from 'k6/http';
import { sleep, check } from 'k6';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp-up to 10 VUs
    { duration: '20s', target: 20 }, // Load test at 20 VUs
    { duration: '10s', target: 0 },  // Ramp-down to 0 VUs
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // Error rate should be less than 1%
    http_req_duration: ['p(95)<300'], // 95% of requests should be below 300ms
  },
};

const BASE_URL = 'http://localhost:3000/api';

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
];

// The setup function runs once and fetches valid category IDs from Payload
export function setup() {
  console.log(`fetching categories from ${BASE_URL}/categories...`);
  const res = http.get(`${BASE_URL}/categories?limit=100`);
  
  let categoryIds = [];
  try {
    const data = res.json();
    if (data && Array.isArray(data.docs)) {
      categoryIds = data.docs.map(doc => doc.id);
    }
  } catch (e) {
    console.error('Failed to parse categories:', e);
  }
  
  console.log(`Setup complete. Fetched ${categoryIds.length} category IDs.`);
  return { categoryIds };
}

export default function (data) {
  const categoryIds = data.categoryIds;

  // 1. Randomly pick an API read endpoint type
  const scenario = Math.floor(Math.random() * 4);
  let url = '';
  let name = '';

  switch (scenario) {
    case 0:
      // Scenario 0: Paginated Media List
      url = `${BASE_URL}/media?limit=20`;
      name = 'List Media (Page 1)';
      break;

    case 1:
      // Scenario 1: Filter by a random tag
      const randomTag = randomItem(TAGS_POOL);
      url = `${BASE_URL}/media?where[tags][like]=${randomTag}&limit=20`;
      name = 'Filter by Tag (like)';
      break;

    case 2:
      // Scenario 2: Relationship query by category
      if (categoryIds && categoryIds.length > 0) {
        const randomCategory = randomItem(categoryIds);
        url = `${BASE_URL}/media?where[category][equals]=${randomCategory}&limit=20`;
        name = 'Filter by Category (equals)';
      } else {
        url = `${BASE_URL}/media?limit=10`;
        name = 'List Media (Fallback)';
      }
      break;

    case 3:
      // Scenario 3: Deep offset pagination query
      const randomPage = Math.floor(Math.random() * 100) + 10; // query pages between 10 and 110
      url = `${BASE_URL}/media?page=${randomPage}&limit=20`;
      name = 'Deep Offset Pagination';
      break;
  }

  // 2. Perform request
  const response = http.get(url, {
    tags: { name: name },
  });

  // 3. Validate response
  check(response, {
    'status is 200': (r) => r.status === 200,
    'has docs array': (r) => {
      try {
        return Array.isArray(r.json().docs);
      } catch (e) {
        return false;
      }
    },
  });

  // 4. Think time (between 100ms and 500ms)
  sleep(Math.random() * 0.4 + 0.1);
}
