import { DEFAULT_LAYOUT, type LayoutData } from "./types"

export function normalizeLayout(input: LayoutData): LayoutData {
  const project = { ...DEFAULT_LAYOUT.project, ...input.project }
  const overview = { ...DEFAULT_LAYOUT.overview, ...input.overview }
  const exportSettings = { ...DEFAULT_LAYOUT.exportSettings, ...input.exportSettings }

  return {
    ...DEFAULT_LAYOUT,
    ...input,
    schemaVersion: Math.max(input.schemaVersion ?? 1, DEFAULT_LAYOUT.schemaVersion),
    project,
    overview,
    exportSettings,
    cabinetTypes: input.cabinetTypes?.length ? input.cabinetTypes : DEFAULT_LAYOUT.cabinetTypes,
    cabinets: input.cabinets ?? [],
    dataRoutes: input.dataRoutes ?? [],
    powerFeeds: input.powerFeeds ?? [],
  }
}
