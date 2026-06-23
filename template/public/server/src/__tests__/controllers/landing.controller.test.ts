import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock landing service
vi.mock('../../services/landing.service', () => ({
  getLandingPageData: vi.fn(),
}));

import * as landingService from '../../services/landing.service';
import { getLandingPageData } from '../../controllers/landing.controller';

const mockLandingData = {
  stats: {
    publishedResourceCount: 7,
    serviceLocationCount: 12,
    activeFormCount: 3,
  },
  featuredResources: [
    {
      id: '22222222-0001-0001-0001-000000000001',
      title: 'Edmonton Transit Guide',
      status: 'published',
      category: 'Transportation',
      summary: 'A comprehensive transit guide for Edmonton.',
      author: 'Admin User',
      region: 'Edmonton',
      publishedAt: '2024-05-14T16:00:00.000Z',
    },
  ],
  recentUpdates: [
    {
      id: '33333333-0001-0001-0001-000000000005',
      resourceId: '22222222-0001-0001-0001-000000000001',
      resourceTitle: 'Edmonton Transit Guide',
      title: 'Schedule Update',
      description: 'Updated bus schedules for summer.',
      type: 'general',
      createdAt: '2024-05-14T16:00:00.000Z',
    },
  ],
  serviceHighlights: [
    {
      id: '77777777-0001-0001-0001-000000000001',
      title: 'Permit Applications',
      descriptionBrief: 'Apply for various permits online.',
      categoryName: 'Government Services',
      categoryIcon: 'document',
    },
  ],
  announcements: [
    {
      id: 'bbb00001-0001-0001-0001-000000000003',
      title: 'Service Maintenance Notice',
      body: 'Scheduled maintenance for online services.',
      createdAt: '2024-05-22T12:00:00.000Z',
    },
  ],
};

describe('Landing Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('should return landing page data with success envelope', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    expect(landingService.getLandingPageData).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockLandingData,
    });
  });

  it('should return correct stats with published resource count', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.stats.publishedResourceCount).toBe(7);
    expect(responseData.stats.serviceLocationCount).toBe(12);
    expect(responseData.stats.activeFormCount).toBe(3);
  });

  it('should include featured resources', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.featuredResources).toHaveLength(1);
    expect(responseData.featuredResources[0].title).toBeDefined();
    expect(responseData.featuredResources[0].region).toBeDefined();
  });

  it('should include recent updates limited to 5', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.recentUpdates.length).toBeLessThanOrEqual(5);
  });

  it('should include service highlights', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.serviceHighlights).toHaveLength(1);
    expect(responseData.serviceHighlights[0].title).toBe('Permit Applications');
  });

  it('should include announcements when present', async () => {
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(mockLandingData);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.announcements).toHaveLength(1);
    expect(responseData.announcements[0].title).toContain('Service Maintenance');
  });

  it('should handle empty announcements', async () => {
    const dataNoAnnouncements = { ...mockLandingData, announcements: [] };
    vi.mocked(landingService.getLandingPageData).mockResolvedValue(dataNoAnnouncements);

    await getLandingPageData(req as Request, res as Response);

    const responseData = (res.json as any).mock.calls[0][0].data;
    expect(responseData.announcements).toHaveLength(0);
  });
});
