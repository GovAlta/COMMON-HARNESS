/**
 * Mock data for template demonstration.
 * TODO: Replace with real API calls via @/lib/api when connecting to a backend.
 * See CLAUDE.md "Adapting the Template" section for migration instructions.
 */

export interface Region {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  type: 'office' | 'warehouse' | 'retail';
  siteCount: number;
}

export const regions: Region[] = [
  { id: 'reg-001', name: 'New York', country: 'US', lat: 40.7128, lng: -74.006, type: 'office', siteCount: 8 },
  { id: 'reg-002', name: 'Los Angeles', country: 'US', lat: 33.9425, lng: -118.408, type: 'warehouse', siteCount: 5 },
  { id: 'reg-003', name: 'Chicago', country: 'US', lat: 41.8781, lng: -87.6298, type: 'office', siteCount: 6 },
  { id: 'reg-004', name: 'Houston', country: 'US', lat: 29.7604, lng: -95.3698, type: 'warehouse', siteCount: 7 },
  { id: 'reg-005', name: 'San Francisco', country: 'US', lat: 37.7749, lng: -122.4194, type: 'office', siteCount: 4 },
  { id: 'reg-006', name: 'Miami', country: 'US', lat: 25.7617, lng: -80.1918, type: 'retail', siteCount: 3 },
  { id: 'reg-007', name: 'Seattle', country: 'US', lat: 47.6062, lng: -122.3321, type: 'warehouse', siteCount: 5 },
  { id: 'reg-008', name: 'Denver', country: 'US', lat: 39.7392, lng: -104.9903, type: 'retail', siteCount: 3 },
  { id: 'reg-009', name: 'Boston', country: 'US', lat: 42.3601, lng: -71.0589, type: 'office', siteCount: 4 },
  { id: 'reg-010', name: 'Atlanta', country: 'US', lat: 33.749, lng: -84.388, type: 'warehouse', siteCount: 6 },
  { id: 'reg-011', name: 'Dallas', country: 'US', lat: 32.7767, lng: -96.797, type: 'retail', siteCount: 4 },
  { id: 'reg-012', name: 'Phoenix', country: 'US', lat: 33.4484, lng: -112.074, type: 'warehouse', siteCount: 3 },
];

export const regionTypes = [
  { label: 'All Types', value: null },
  { label: 'Office', value: 'office' },
  { label: 'Warehouse', value: 'warehouse' },
  { label: 'Retail', value: 'retail' },
];
