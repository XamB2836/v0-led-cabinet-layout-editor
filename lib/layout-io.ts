import { DEFAULT_LAYOUT, type LayoutData } from "./types"

export function normalizeLayout(input: LayoutData): LayoutData {
  const legacyControllerLabel = (input.project as { exportSettings?: { controllerLabel?: string } } | undefined)
    ?.exportSettings?.controllerLabel
  const defaultOverview = DEFAULT_LAYOUT.project.overview
  const incomingOverview = input.project?.overview
  const mappingNumbers = {
    ...defaultOverview.mappingNumbers,
    ...incomingOverview?.mappingNumbers,
    manualAssignments: {
      ...defaultOverview.mappingNumbers.manualAssignments,
      ...incomingOverview?.mappingNumbers?.manualAssignments,
      perChain: {
        ...defaultOverview.mappingNumbers.manualAssignments?.perChain,
        ...incomingOverview?.mappingNumbers?.manualAssignments?.perChain,
      },
      perEndpoint: {
        ...defaultOverview.mappingNumbers.manualAssignments?.perEndpoint,
        ...incomingOverview?.mappingNumbers?.manualAssignments?.perEndpoint,
      },
    },
    positionOverrides: {
      ...defaultOverview.mappingNumbers.positionOverrides,
      ...incomingOverview?.mappingNumbers?.positionOverrides,
    },
  }
  const project = {
    ...DEFAULT_LAYOUT.project,
    ...input.project,
    overview: { ...defaultOverview, ...incomingOverview, mappingNumbers },
    exportSettings: { ...DEFAULT_LAYOUT.project.exportSettings, ...input.project?.exportSettings },
    dataRoutes: input.project?.dataRoutes ?? DEFAULT_LAYOUT.project.dataRoutes,
    powerFeeds: input.project?.powerFeeds ?? DEFAULT_LAYOUT.project.powerFeeds,
    controllerLabel: input.project?.controllerLabel ?? legacyControllerLabel ?? DEFAULT_LAYOUT.project.controllerLabel,
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
