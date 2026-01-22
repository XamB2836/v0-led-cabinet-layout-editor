import { DEFAULT_LAYOUT, type LayoutData } from "./types"

export function normalizeLayout(input: LayoutData): LayoutData {
  const project = {
    ...DEFAULT_LAYOUT.project,
    ...input.project,
    overview: { ...DEFAULT_LAYOUT.project.overview, ...input.project?.overview },
    exportSettings: { ...DEFAULT_LAYOUT.project.exportSettings, ...input.project?.exportSettings },
    dataRoutes: input.project?.dataRoutes ?? DEFAULT_LAYOUT.project.dataRoutes,
    powerFeeds: input.project?.powerFeeds ?? DEFAULT_LAYOUT.project.powerFeeds,
  }

  const cabinetIds = new Set((input.cabinets ?? []).map((cabinet) => cabinet.id))
  const requestedCabinetId = project.controllerCabinetId
  const wantsCabinetController =
    project.controllerPlacement === "cabinet" && !!requestedCabinetId && cabinetIds.size > 0
  const hasCabinetController = wantsCabinetController && cabinetIds.has(requestedCabinetId)
  const controllerPlacement = hasCabinetController ? "cabinet" : "external"
  const controllerCabinetId = hasCabinetController ? requestedCabinetId : undefined

  return {
    ...DEFAULT_LAYOUT,
    ...input,
    schemaVersion: Math.max(input.schemaVersion ?? 1, DEFAULT_LAYOUT.schemaVersion),
    project: { ...project, controllerPlacement, controllerCabinetId },
    cabinetTypes: input.cabinetTypes?.length ? input.cabinetTypes : DEFAULT_LAYOUT.cabinetTypes,
    cabinets: input.cabinets ?? [],
  }
}
