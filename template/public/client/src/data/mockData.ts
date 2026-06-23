/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

import { regions, type Region } from './regions';
import { products, type Product } from './products';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  date: string;
  regionId: string;
  regionName: string;
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  revenue: number;
  status: 'completed' | 'pending' | 'cancelled';
}

export interface PortalStats {
  totalOrders: number;
  totalRevenue: number;
  regions: number;
  categories: number;
}

export interface TimeSeriesPoint {
  month: string;
  orders: number;
  revenue: number;
  completed: number;
  pending: number;
  cancelled: number;
}

export interface HeatmapCell {
  regionId: string;
  regionName: string;
  category: string;
  orders: number;
  revenue: number;
}

// ── Seeded random for deterministic data ───────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);

// ── Generate ~500 orders ───────────────────────────────────────────────────

const statusWeights = [0.72, 0.2, 0.08]; // 72% completed, 20% pending, 8% cancelled

function pickStatus(): Order['status'] {
  const r = rand();
  if (r < statusWeights[0]) return 'completed';
  if (r < statusWeights[0] + statusWeights[1]) return 'pending';
  return 'cancelled';
}

function randomDate(start: Date, end: Date): string {
  const ms = start.getTime() + rand() * (end.getTime() - start.getTime());
  return new Date(ms).toISOString().split('T')[0];
}

const ORDER_COUNT = 500;
const startDate = new Date('2025-03-01');
const endDate = new Date('2026-02-28');

export const orders: Order[] = [];

for (let i = 0; i < ORDER_COUNT; i++) {
  const region = regions[Math.floor(rand() * regions.length)];
  const product = products[Math.floor(rand() * products.length)];
  const quantity = 1 + Math.floor(rand() * 20);
  const status = pickStatus();
  const revenue = Math.round(product.price * quantity * (0.85 + rand() * 0.3) * 100) / 100;

  orders.push({
    id: `ORD-${String(i + 1).padStart(4, '0')}`,
    date: randomDate(startDate, endDate),
    regionId: region.id,
    regionName: region.name,
    productId: product.id,
    productName: product.name,
    category: product.category,
    quantity,
    revenue,
    status,
  });
}

// Sort orders by date
orders.sort((a, b) => a.date.localeCompare(b.date));

// ── Time series helper: aggregate orders by month ──────────────────────────

export function getTimeSeries(
  regionIds: string[] | null = null,
  category: string | null = null
): TimeSeriesPoint[] {
  const filtered = orders.filter((o) => {
    if (regionIds && regionIds.length && !regionIds.includes(o.regionId)) return false;
    if (category && o.category !== category) return false;
    return true;
  });

  const byMonth: Record<string, TimeSeriesPoint> = {};

  filtered.forEach((o) => {
    const month = o.date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) {
      byMonth[month] = { month, orders: 0, revenue: 0, completed: 0, pending: 0, cancelled: 0 };
    }
    byMonth[month].orders++;
    byMonth[month].revenue = Math.round((byMonth[month].revenue + o.revenue) * 100) / 100;
    byMonth[month][o.status]++;
  });

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}

// ── Heatmap data helper: region x category matrix ──────────────────────────

export function getHeatmapData(): HeatmapCell[] {
  const map: Record<string, HeatmapCell> = {};

  orders.forEach((o) => {
    const key = `${o.regionId}|${o.category}`;
    if (!map[key]) {
      map[key] = {
        regionId: o.regionId,
        regionName: o.regionName,
        category: o.category,
        orders: 0,
        revenue: 0,
      };
    }
    map[key].orders++;
    map[key].revenue = Math.round((map[key].revenue + o.revenue) * 100) / 100;
  });

  return Object.values(map);
}

// ── Portal stats ───────────────────────────────────────────────────────────

const allCategories = [...new Set(orders.map((o) => o.category))];

export const portalStats: PortalStats = {
  totalOrders: orders.length,
  totalRevenue: Math.round(orders.reduce((sum, o) => sum + o.revenue, 0) * 100) / 100,
  regions: regions.length,
  categories: allCategories.length,
};

// Re-export for convenience
export type { Region, Product };
