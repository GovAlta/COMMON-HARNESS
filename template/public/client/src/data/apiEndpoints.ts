/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

export interface ApiParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  parameters: ApiParameter[];
  exampleResponse: string;
  curlExample: string;
}

export const apiEndpoints: ApiEndpoint[] = [
  {
    id: 'orders',
    method: 'GET',
    path: '/api/v1/orders',
    summary: 'Retrieve orders',
    description:
      'Returns paginated order records filtered by region, product, category, date range, and status. Each order includes quantity, revenue, and fulfillment status.',
    parameters: [
      { name: 'region_id', type: 'string', required: false, description: 'Filter by region ID (comma-separated for multiple)' },
      { name: 'category', type: 'string', required: false, description: 'Filter by product category: Electronics, Software, Services, Hardware' },
      { name: 'status', type: 'string', required: false, description: 'Filter by status: completed, pending, cancelled' },
      { name: 'date_from', type: 'string', required: false, description: 'Start date (ISO 8601: YYYY-MM-DD)' },
      { name: 'date_to', type: 'string', required: false, description: 'End date (ISO 8601: YYYY-MM-DD)' },
      { name: 'page', type: 'integer', required: false, description: 'Page number (default: 1)' },
      { name: 'per_page', type: 'integer', required: false, description: 'Results per page (default: 50, max: 500)' },
      { name: 'sort', type: 'string', required: false, description: 'Sort field: date, revenue, quantity' },
      { name: 'order', type: 'string', required: false, description: 'Sort order: asc or desc' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: [
          {
            id: 'ORD-0142',
            date: '2025-08-15',
            region_id: 'reg-004',
            region_name: 'Houston',
            product_id: 'prod-006',
            product_name: 'Analytics Platform License',
            category: 'Software',
            quantity: 3,
            revenue: 6824.97,
            status: 'completed',
          },
        ],
        pagination: { page: 1, per_page: 50, total_results: 500, total_pages: 10 },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/orders?category=Software&status=completed&per_page=25" \\
  -H "Accept: application/json" \\
  -H "Authorization: Bearer <api-key>"`,
  },
  {
    id: 'products',
    method: 'GET',
    path: '/api/v1/products',
    summary: 'List products',
    description:
      'Returns the product catalog with pricing, category, stock status, and descriptions. Supports filtering by category and stock availability.',
    parameters: [
      { name: 'category', type: 'string', required: false, description: 'Filter by category: Electronics, Software, Services, Hardware' },
      { name: 'in_stock', type: 'boolean', required: false, description: 'Filter by stock availability' },
      { name: 'min_price', type: 'number', required: false, description: 'Minimum price filter' },
      { name: 'max_price', type: 'number', required: false, description: 'Maximum price filter' },
      { name: 'search', type: 'string', required: false, description: 'Free-text search on product name and description' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: [
          {
            id: 'prod-006',
            name: 'Analytics Platform License',
            category: 'Software',
            price: 2499.99,
            description: 'Annual license for the full analytics suite.',
            in_stock: true,
          },
        ],
        pagination: { page: 1, per_page: 50, total_results: 20, total_pages: 1 },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/products?category=Software&in_stock=true" \\
  -H "Accept: application/json"`,
  },
  {
    id: 'regions',
    method: 'GET',
    path: '/api/v1/regions',
    summary: 'List regions',
    description:
      'Returns all operational regions with geospatial coordinates, site type, and site counts. Supports filtering by type and proximity-based geo queries.',
    parameters: [
      { name: 'type', type: 'string', required: false, description: 'Filter by site type: office, warehouse, retail' },
      { name: 'lat', type: 'number', required: false, description: 'Center latitude for geo search' },
      { name: 'lng', type: 'number', required: false, description: 'Center longitude for geo search' },
      { name: 'radius_km', type: 'number', required: false, description: 'Search radius in kilometers (max: 500)' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: [
          {
            id: 'reg-001',
            name: 'New York',
            country: 'US',
            coordinates: { lat: 40.7128, lng: -74.006 },
            type: 'office',
            site_count: 8,
          },
        ],
        pagination: { page: 1, per_page: 50, total_results: 12, total_pages: 1 },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/regions?type=warehouse" \\
  -H "Accept: application/json"`,
  },
  {
    id: 'analytics-timeseries',
    method: 'GET',
    path: '/api/v1/analytics/timeseries',
    summary: 'Aggregated time series data',
    description:
      'Returns order and revenue aggregates grouped by month. Ideal for trend visualization. Supports filtering by region and category with configurable time intervals.',
    parameters: [
      { name: 'region_id', type: 'string', required: false, description: 'Filter by region ID(s), comma-separated' },
      { name: 'category', type: 'string', required: false, description: 'Filter by product category' },
      { name: 'date_from', type: 'string', required: false, description: 'Start date (YYYY-MM-DD)' },
      { name: 'date_to', type: 'string', required: false, description: 'End date (YYYY-MM-DD)' },
      { name: 'interval', type: 'string', required: false, description: 'Aggregation interval: day, week, month (default)' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: [
          { period: '2025-06', interval: 'month', orders: 48, revenue: 127450.0, completed: 35, pending: 10, cancelled: 3 },
          { period: '2025-07', interval: 'month', orders: 52, revenue: 141280.0, completed: 38, pending: 11, cancelled: 3 },
        ],
        meta: { date_range: { from: '2025-03-01', to: '2026-02-28' }, total_periods: 12 },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/analytics/timeseries?interval=month&date_from=2025-06-01" \\
  -H "Accept: application/json" \\
  -H "Authorization: Bearer <api-key>"`,
  },
  {
    id: 'analytics-summary',
    method: 'GET',
    path: '/api/v1/analytics/summary',
    summary: 'Summary statistics',
    description:
      'Returns high-level summary statistics including total orders, revenue, average order value, completion rate, and top-performing regions and products.',
    parameters: [
      { name: 'date_from', type: 'string', required: false, description: 'Start date for summary window' },
      { name: 'date_to', type: 'string', required: false, description: 'End date for summary window' },
      { name: 'compare_period', type: 'boolean', required: false, description: 'Include prior period comparison (default: false)' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: {
          total_orders: 500,
          total_revenue: 1284350.75,
          avg_order_value: 2568.7,
          completion_rate: 72.0,
          top_region: { id: 'reg-001', name: 'New York', revenue: 142800.0 },
          top_product: { id: 'prod-016', name: 'Rack Server Unit', revenue: 198450.0 },
          category_breakdown: {
            Electronics: 312400.0,
            Software: 418200.0,
            Services: 285600.0,
            Hardware: 268150.75,
          },
        },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/analytics/summary?compare_period=true" \\
  -H "Accept: application/json" \\
  -H "Authorization: Bearer <api-key>"`,
  },
  {
    id: 'users',
    method: 'GET',
    path: '/api/v1/users',
    summary: 'List user accounts',
    description:
      'Returns user accounts with roles, last activity, and assigned regions. Requires admin-level authentication. Supports filtering by role and active status.',
    parameters: [
      { name: 'role', type: 'string', required: false, description: 'Filter by role: admin, manager, analyst, viewer' },
      { name: 'active', type: 'boolean', required: false, description: 'Filter by active status' },
      { name: 'region_id', type: 'string', required: false, description: 'Filter by assigned region' },
      { name: 'search', type: 'string', required: false, description: 'Search by name or email' },
      { name: 'page', type: 'integer', required: false, description: 'Page number (default: 1)' },
      { name: 'per_page', type: 'integer', required: false, description: 'Results per page (default: 50)' },
    ],
    exampleResponse: JSON.stringify(
      {
        data: [
          {
            id: 'usr-001',
            name: 'Alex Rivera',
            email: 'alex.rivera@example.com',
            role: 'admin',
            active: true,
            assigned_regions: ['reg-001', 'reg-003', 'reg-005'],
            last_active: '2026-03-22T14:30:00Z',
            created_at: '2024-08-15T09:00:00Z',
          },
        ],
        pagination: { page: 1, per_page: 50, total_results: 34, total_pages: 1 },
      },
      null,
      2
    ),
    curlExample: `curl -X GET "https://api.example.com/api/v1/users?role=admin&active=true" \\
  -H "Accept: application/json" \\
  -H "Authorization: Bearer <api-key>"`,
  },
];

export const rateLimits = {
  free: {
    requests_per_minute: 20,
    requests_per_day: 500,
    max_per_page: 50,
    description: 'Free tier. No API key required for public endpoints.',
  },
  standard: {
    requests_per_minute: 120,
    requests_per_day: 10000,
    max_per_page: 200,
    description: 'Standard plan. API key required.',
  },
  enterprise: {
    requests_per_minute: 600,
    requests_per_day: 100000,
    max_per_page: 500,
    description: 'Enterprise plan with dedicated support and SLA guarantees.',
  },
};
