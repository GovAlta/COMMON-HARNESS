import type { Dashboard } from '@/data/dashboards'

export interface PreviewBars {
  data: number[]
  color: string
}

export function getPreviewBars(dash: Dashboard, accentColor: string): PreviewBars {
  const cfg = dash.mockChartConfig
  if (cfg.datasets?.[0]?.data) {
    return { data: cfg.datasets[0].data.slice(0, 8), color: accentColor }
  }
  return { data: [3, 5, 7, 4, 6, 8, 5, 3], color: accentColor }
}
