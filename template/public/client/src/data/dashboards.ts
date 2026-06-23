/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

export interface DashboardChartDataset {
  label: string;
  color: string;
  data: number[];
}

export interface MockChartConfig {
  labels: string[];
  datasets: DashboardChartDataset[];
}

export interface Dashboard {
  id: number;
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  methodology?: string;
  category: 'Sales' | 'Operations' | 'Marketing' | 'Analytics';
  icon: string;
  chartType: 'line' | 'bar' | 'scatter';
  sites?: number;
  sampleCount?: number;
  features: string[];
  mockChartConfig: MockChartConfig;
  lastUpdated: string;
}

export const dashboards: Dashboard[] = [
  {
    id: 1,
    slug: 'revenue-trends',
    title: 'Revenue Trends',
    description:
      'Track monthly and quarterly revenue across all product categories. Identify seasonal patterns, growth trajectories, and compare performance against prior periods.',
    category: 'Sales',
    icon: 'TrendingUp',
    chartType: 'line',
    features: [
      'Monthly revenue line chart with year-over-year comparison',
      'Category breakdown toggle',
      'Trend annotations for key events (launches, promotions)',
      'Exportable CSV and PNG snapshots',
    ],
    mockChartConfig: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        { label: 'Electronics', color: '#6366f1', data: [42000, 48000, 51000, 46000, 53000, 58000, 55000, 62000, 67000, 71000, 78000, 85000] },
        { label: 'Software', color: '#0d9488', data: [31000, 33000, 36000, 38000, 41000, 44000, 47000, 50000, 54000, 58000, 62000, 68000] },
        { label: 'Services', color: '#f59e0b', data: [18000, 19500, 21000, 22000, 24000, 25500, 27000, 28000, 30000, 32000, 34000, 37000] },
      ],
    },
    lastUpdated: '2026-03-15',
  },
  {
    id: 2,
    slug: 'order-volume',
    title: 'Order Volume by Region',
    description:
      'Visualize order distribution across all 12 regions. Compare warehouse, office, and retail site performance to identify high-growth and underperforming areas.',
    category: 'Operations',
    icon: 'BarChart3',
    chartType: 'bar',
    features: [
      'Stacked bar chart grouped by region type',
      'Drill-down to individual sites',
      'Fulfillment rate overlay',
      'Date range filtering with presets',
    ],
    mockChartConfig: {
      labels: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'San Francisco', 'Miami', 'Seattle', 'Denver', 'Boston', 'Atlanta', 'Dallas', 'Phoenix'],
      datasets: [
        { label: 'Completed', color: '#22c55e', data: [120, 95, 88, 105, 72, 54, 81, 48, 66, 92, 70, 45] },
        { label: 'Pending', color: '#f59e0b', data: [28, 22, 18, 30, 15, 12, 19, 10, 14, 24, 16, 11] },
        { label: 'Cancelled', color: '#ef4444', data: [8, 6, 5, 9, 4, 3, 5, 3, 4, 7, 5, 3] },
      ],
    },
    lastUpdated: '2026-03-18',
  },
  {
    id: 3,
    slug: 'customer-acquisition',
    title: 'Customer Acquisition Funnel',
    description:
      'Monitor the customer journey from lead generation through conversion. Track acquisition costs, conversion rates, and channel effectiveness across marketing campaigns.',
    category: 'Marketing',
    icon: 'Users',
    chartType: 'bar',
    features: [
      'Funnel visualization: impressions to conversions',
      'Channel attribution breakdown (organic, paid, referral)',
      'Cost per acquisition trend line',
      'A/B test result comparisons',
    ],
    mockChartConfig: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        { label: 'Leads', color: '#6366f1', data: [340, 380, 420, 395, 450, 510, 480, 530, 570, 610, 650, 720] },
        { label: 'Qualified', color: '#0d9488', data: [180, 200, 230, 210, 245, 280, 260, 290, 310, 335, 360, 400] },
        { label: 'Converted', color: '#22c55e', data: [45, 52, 60, 55, 65, 74, 68, 78, 84, 90, 98, 110] },
      ],
    },
    lastUpdated: '2026-03-20',
  },
  {
    id: 4,
    slug: 'product-performance',
    title: 'Product Performance Matrix',
    description:
      'Scatter analysis of products by revenue versus order volume. Identify top performers, underperformers, and opportunities for pricing optimization.',
    category: 'Analytics',
    icon: 'Crosshair',
    chartType: 'scatter',
    features: [
      'Revenue vs. volume scatter plot with category coloring',
      'Quadrant analysis (high revenue / high volume, etc.)',
      'Product-level drill-down on click',
      'Time slider to animate product movement over months',
    ],
    mockChartConfig: {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [
        { label: 'Electronics', color: '#6366f1', data: [156, 178, 195, 220] },
        { label: 'Software', color: '#0d9488', data: [210, 235, 260, 290] },
        { label: 'Services', color: '#f59e0b', data: [85, 92, 105, 118] },
        { label: 'Hardware', color: '#ef4444', data: [64, 71, 78, 88] },
      ],
    },
    lastUpdated: '2026-03-12',
  },
  {
    id: 5,
    slug: 'fulfillment-metrics',
    title: 'Fulfillment & Logistics',
    description:
      'Operational metrics for order fulfillment including processing time, shipping accuracy, and return rates across warehouse locations.',
    category: 'Operations',
    icon: 'Truck',
    chartType: 'line',
    features: [
      'Average fulfillment time trend by warehouse',
      'Shipping accuracy percentage',
      'Return rate monitoring with threshold alerts',
      'Carrier performance comparison',
    ],
    mockChartConfig: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        { label: 'Avg. Fulfillment (hrs)', color: '#6366f1', data: [36, 34, 32, 30, 28, 27, 26, 25, 24, 23, 22, 21] },
        { label: 'Accuracy (%)', color: '#22c55e', data: [96.2, 96.5, 96.8, 97.0, 97.3, 97.5, 97.8, 98.0, 98.1, 98.3, 98.5, 98.7] },
      ],
    },
    lastUpdated: '2026-03-19',
  },
  {
    id: 6,
    slug: 'campaign-roi',
    title: 'Campaign ROI Analysis',
    description:
      'Measure return on investment across marketing campaigns. Compare spend allocation, conversion attribution, and revenue impact by channel and campaign.',
    category: 'Marketing',
    icon: 'DollarSign',
    chartType: 'bar',
    features: [
      'Campaign-level ROI comparison bar chart',
      'Spend vs. revenue overlay',
      'Attribution model toggle (first-touch, last-touch, linear)',
      'Budget allocation recommendations',
    ],
    mockChartConfig: {
      labels: ['Email', 'Paid Search', 'Social', 'Content', 'Events', 'Referral'],
      datasets: [
        { label: 'Spend ($K)', color: '#ef4444', data: [12, 45, 28, 15, 35, 8] },
        { label: 'Revenue ($K)', color: '#22c55e', data: [58, 142, 76, 64, 95, 48] },
      ],
    },
    lastUpdated: '2026-03-17',
  },
];

export const dashboardCategories = [
  { value: 'all', label: 'All Dashboards' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Analytics', label: 'Analytics' },
];
