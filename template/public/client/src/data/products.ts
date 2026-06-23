/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

export interface Product {
  id: string;
  name: string;
  category: 'Electronics' | 'Software' | 'Services' | 'Hardware';
  price: number;
  description: string;
  inStock: boolean;
}

export const products: Product[] = [
  // Electronics
  { id: 'prod-001', name: 'Smart Display Hub', category: 'Electronics', price: 349.99, description: 'Interactive 15-inch touchscreen display for conference rooms with wireless casting and video conferencing integration.', inStock: true },
  { id: 'prod-002', name: 'Wireless Sensor Kit', category: 'Electronics', price: 129.99, description: 'Pack of 6 IoT environmental sensors monitoring temperature, humidity, and air quality with cloud connectivity.', inStock: true },
  { id: 'prod-003', name: 'Edge Gateway Pro', category: 'Electronics', price: 599.99, description: 'Industrial-grade edge computing gateway with 4G/5G connectivity and local data processing capabilities.', inStock: false },
  { id: 'prod-004', name: 'Portable Barcode Scanner', category: 'Electronics', price: 89.99, description: 'Ruggedized Bluetooth barcode and QR scanner with 12-hour battery life for warehouse operations.', inStock: true },
  { id: 'prod-005', name: 'Digital Signage Controller', category: 'Electronics', price: 249.99, description: 'Compact media player for driving retail digital signage with remote content management.', inStock: true },

  // Software
  { id: 'prod-006', name: 'Analytics Platform License', category: 'Software', price: 2499.99, description: 'Annual license for the full analytics suite including dashboards, reporting, and data exploration tools.', inStock: true },
  { id: 'prod-007', name: 'Inventory Management Module', category: 'Software', price: 799.99, description: 'Real-time inventory tracking add-on with barcode integration, reorder alerts, and multi-warehouse support.', inStock: true },
  { id: 'prod-008', name: 'API Gateway Subscription', category: 'Software', price: 199.99, description: 'Monthly subscription for managed API gateway with rate limiting, authentication, and usage analytics.', inStock: true },
  { id: 'prod-009', name: 'Data Connector Pack', category: 'Software', price: 449.99, description: 'Pre-built integrations for 50+ data sources including Salesforce, SAP, Shopify, and major databases.', inStock: true },
  { id: 'prod-010', name: 'Mobile Workforce App', category: 'Software', price: 149.99, description: 'Per-seat annual license for the mobile field operations app with offline mode and GPS tracking.', inStock: false },

  // Services
  { id: 'prod-011', name: 'Implementation Package', category: 'Services', price: 4999.99, description: 'Full onboarding and implementation service including data migration, configuration, and staff training.', inStock: true },
  { id: 'prod-012', name: 'Custom Dashboard Design', category: 'Services', price: 1999.99, description: 'Bespoke dashboard design and development tailored to your KPIs with up to 3 revision rounds.', inStock: true },
  { id: 'prod-013', name: 'Priority Support Plan', category: 'Services', price: 899.99, description: 'Annual premium support with 2-hour response SLA, dedicated account manager, and quarterly reviews.', inStock: true },
  { id: 'prod-014', name: 'Data Migration Service', category: 'Services', price: 2499.99, description: 'End-to-end data migration from legacy systems with validation, cleansing, and reconciliation.', inStock: true },
  { id: 'prod-015', name: 'Security Audit', category: 'Services', price: 3499.99, description: 'Comprehensive security assessment covering infrastructure, application, and data handling practices.', inStock: false },

  // Hardware
  { id: 'prod-016', name: 'Rack Server Unit', category: 'Hardware', price: 4299.99, description: '2U rack-mounted server with dual Xeon processors, 128GB RAM, and 4TB NVMe storage for on-premise deployments.', inStock: true },
  { id: 'prod-017', name: 'Network Switch 48-Port', category: 'Hardware', price: 1299.99, description: 'Managed Layer 3 switch with 48 GbE ports and 4 SFP+ uplinks for enterprise networking.', inStock: true },
  { id: 'prod-018', name: 'UPS Battery Backup', category: 'Hardware', price: 549.99, description: '1500VA uninterruptible power supply with automatic voltage regulation and 45-minute runtime at half load.', inStock: true },
  { id: 'prod-019', name: 'Thermal Label Printer', category: 'Hardware', price: 399.99, description: 'High-speed thermal transfer printer for shipping labels, barcodes, and asset tags at 300 DPI.', inStock: false },
  { id: 'prod-020', name: 'Rugged Tablet', category: 'Hardware', price: 879.99, description: '10-inch IP67-rated tablet with sunlight-readable display for warehouse and field operations.', inStock: true },
];

export const productCategories: Product['category'][] = ['Electronics', 'Software', 'Services', 'Hardware'];

/** Top 10 products by price (highest value items) */
export const topProducts: Product[] = [...products]
  .filter((p) => p.inStock)
  .sort((a, b) => b.price - a.price)
  .slice(0, 10);
