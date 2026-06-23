import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database pool
const mockQuery = vi.fn();
vi.mock('../../config/database', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { getLandingPageData } from '../../services/landing.service';

describe('Landing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run 5 parallel queries', async () => {
    // Setup mocks for all 5 queries
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ published_resource_count: '5', service_location_count: '12', active_form_count: '3' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'abc',
            title: 'Test Resource',
            status: 'published',
            category: 'Transportation',
            summary: 'A test resource',
            author: 'Admin',
            region: 'Edmonton',
            publishedAt: '2024-05-14T16:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'svc1',
            title: 'Service 1',
            descriptionBrief: 'Brief desc',
            categoryName: 'Government Services',
            categoryIcon: 'document',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'upd1',
            resourceId: 'abc',
            resourceTitle: 'Test Resource',
            title: 'Update 1',
            description: 'Desc',
            type: 'general',
            createdAt: '2024-05-14T16:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const result = await getLandingPageData();

    expect(mockQuery).toHaveBeenCalledTimes(5);
    expect(result.stats.publishedResourceCount).toBe(5);
    expect(result.stats.serviceLocationCount).toBe(12);
    expect(result.stats.activeFormCount).toBe(3);
  });

  it('should return zero stats when no data', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ published_resource_count: '0', service_location_count: '0', active_form_count: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getLandingPageData();
    expect(result.stats.publishedResourceCount).toBe(0);
    expect(result.featuredResources).toHaveLength(0);
  });

  it('should return service highlights', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ published_resource_count: '0', service_location_count: '0', active_form_count: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 's1', title: 'Service A', descriptionBrief: 'Brief A', categoryName: 'Cat1', categoryIcon: 'icon1' },
          { id: 's2', title: 'Service B', descriptionBrief: 'Brief B', categoryName: 'Cat2', categoryIcon: 'icon2' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getLandingPageData();
    expect(result.serviceHighlights).toHaveLength(2);
    expect(result.serviceHighlights[0].title).toBe('Service A');
    expect(result.serviceHighlights[1].categoryName).toBe('Cat2');
  });

  it('should return announcements', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ published_resource_count: '0', service_location_count: '0', active_form_count: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'e1', title: 'Service Announcement', body: 'Alert body', createdAt: '2024-05-22T12:00:00Z' },
        ],
      });

    const result = await getLandingPageData();
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].title).toBe('Service Announcement');
  });

  it('should return recent updates with resource titles', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ published_resource_count: '1', service_location_count: '0', active_form_count: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'r1', title: 'Resource 1', status: 'published', category: 'General', summary: null, author: null, region: 'Edmonton', publishedAt: '2024-05-14T10:00:00Z' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'u1', resourceId: 'r1', resourceTitle: 'Resource 1', title: 'First Update', description: 'Description', type: 'general', createdAt: '2024-05-14T10:00:00Z' },
          { id: 'u2', resourceId: 'r1', resourceTitle: 'Resource 1', title: 'Second Update', description: 'More', type: 'general', createdAt: '2024-05-14T12:00:00Z' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getLandingPageData();
    expect(result.recentUpdates).toHaveLength(2);
    expect(result.recentUpdates[0].resourceTitle).toBe('Resource 1');
  });
});
