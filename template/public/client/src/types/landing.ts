/**
 * Client-side landing page aggregated data shape.
 * Mirrors server/src/services/landing.service.ts LandingPageData.
 */

export interface LandingStats {
  publishedResourceCount: number
  serviceLocationCount: number
  activeFormCount: number
}

export interface LandingFeaturedResource {
  id: string
  title: string
  status: string
  category: string
  summary: string | null
  author: string | null
  region: string | null
  publishedAt: string | null
}

export interface LandingServiceHighlight {
  id: string
  title: string
  descriptionBrief: string
  categoryName: string
  categoryIcon: string
}

export interface LandingRecentUpdate {
  id: string
  resourceId: string
  resourceTitle: string
  title: string
  description: string | null
  type: string
  createdAt: string
}

export interface LandingAnnouncement {
  id: string
  title: string
  body: string
  createdAt: string
}

export interface LandingPageData {
  stats: LandingStats
  featuredResources: LandingFeaturedResource[]
  serviceHighlights: LandingServiceHighlight[]
  recentUpdates: LandingRecentUpdate[]
  announcements: LandingAnnouncement[]
}
