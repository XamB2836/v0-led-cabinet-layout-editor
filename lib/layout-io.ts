import { DEFAULT_LAYOUT, type CabinetType, type LayoutData } from "./types"
import { coerceModeModuleSize, coerceModePitch, coerceProjectMode, getModeCabinetTypes } from "./modes"
import { getDefaultOutdoorLvBoxCabinetId } from "./controller-utils"

function inferCabinetTypeFromId(typeId: string): CabinetType | null {
  const match = typeId.match(/(\d+)\s*x\s*(\d+)/i)
  if (!match) return null
  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    typeId,
    width_mm: width,
    height_mm: height,
  }
}

export function normalizeLayout(input: LayoutData): LayoutData {
  const mode = coerceProjectMode((input.project as { mode?: unknown } | undefined)?.mode)
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
    mode,
    overview: { ...defaultOverview, ...incomingOverview, mappingNumbers },
    exportSettings: { ...DEFAULT_LAYOUT.project.exportSettings, ...input.project?.exportSettings },
    dataRoutes: input.project?.dataRoutes ?? DEFAULT_LAYOUT.project.dataRoutes,
    powerFeeds: input.project?.powerFeeds ?? DEFAULT_LAYOUT.project.powerFeeds,
    controllerLabel: input.project?.controllerLabel ?? legacyControllerLabel ?? DEFAULT_LAYOUT.project.controllerLabel,
  }
  const requestedPlacement = input.project?.controllerPlacement
  const effectivePlacement = requestedPlacement ?? (mode === "outdoor" ? "cabinet" : DEFAULT_LAYOUT.project.controllerPlacement)
  const coercedPitch = coerceModePitch(mode, project.pitch_mm, project.pitch_is_gob)
  const coercedModuleSize = coerceModeModuleSize(mode, project.overview.moduleSize)
  const normalizedProject = {
    ...project,
    pitch_mm: coercedPitch.pitch_mm,
    pitch_is_gob: coercedPitch.pitch_is_gob,
    overview: {
      ...project.overview,
      moduleSize: coercedModuleSize,
    },
  }

  const cabinets = (input.cabinets ?? []).map((cabinet) =>
    mode === "outdoor" ? { ...cabinet, rot_deg: 0 as const } : cabinet,
  )
  const baseCabinetTypes = input.cabinetTypes?.length ? input.cabinetTypes : getModeCabinetTypes(mode)
  const resolvedCabinetTypesById = new Map<string, CabinetType>(
    baseCabinetTypes.map((type) => [type.typeId, type]),
  )
  cabinets.forEach((cabinet) => {
    if (resolvedCabinetTypesById.has(cabinet.typeId)) return
    const inferred = inferCabinetTypeFromId(cabinet.typeId)
    if (!inferred) return
    resolvedCabinetTypesById.set(inferred.typeId, inferred)
  })
  const resolvedCabinetTypes = Array.from(resolvedCabinetTypesById.values())
  const cabinetIds = new Set(cabinets.map((cabinet) => cabinet.id))
  const requestedCabinetId = normalizedProject.controllerCabinetId
  const wantsCabinetController = effectivePlacement === "cabinet"
  const hasRequestedCabinet = !!requestedCabinetId && cabinetIds.has(requestedCabinetId)
  const fallbackOutdoorCabinetId =
    mode === "outdoor" && cabinets.length > 0
      ? getDefaultOutdoorLvBoxCabinetId(cabinets, resolvedCabinetTypes)
      : undefined
  const controllerPlacement =
    wantsCabinetController && (mode === "outdoor" || hasRequestedCabinet) ? "cabinet" : "external"
  const controllerCabinetId =
    controllerPlacement === "cabinet"
      ? hasRequestedCabinet
        ? requestedCabinetId
        : mode === "outdoor"
          ? fallbackOutdoorCabinetId
          : undefined
      : undefined

  return {
    ...DEFAULT_LAYOUT,
    ...input,
    schemaVersion: Math.max(input.schemaVersion ?? 1, DEFAULT_LAYOUT.schemaVersion),
    project: { ...normalizedProject, controllerPlacement, controllerCabinetId },
    cabinetTypes: resolvedCabinetTypes,
    cabinets,
  }
}
