import { getOrientedModuleSize } from "./module-utils"
import {
  getCabinetReceiverCardCount,
  parseRouteCabinetId,
  type Cabinet,
  type DataRouteStep,
  type LayoutData,
  type ProjectMode,
} from "./types"
import { getLayoutBounds, getCabinetBounds } from "./validation"

export type CadDrawingView = "front" | "rear" | "side" | "top" | "iso"
export type CadEntryType = "power" | "data" | "power_data"
export type CadEntrySide = "front" | "rear" | "left" | "right" | "top" | "bottom"
export type CadLeaderDirection =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

export interface CadProject {
  name: string
  nc: string
  client: string
  endCustomer?: string
  siteName?: string
  location?: string
  mode: ProjectMode
  units: "mm"
  pixelPitch: string
  pitchMm?: number
  gob?: boolean
}

export interface CadAssembly {
  origin: "bottom-left"
  coordinatesAreFinal: true
  defaultZ_mm: number
  rotationUnit: "deg"
}

export interface CadModuleGrid {
  moduleWidth_mm: number
  moduleHeight_mm: number
  moduleCols?: number
  moduleRows?: number
  totalModules: number
  patternOrientation: "landscape" | "portrait"
}

export interface CadLayout {
  totalWidth_mm: number
  totalHeight_mm: number
  totalDepth_mm?: number
  cabinetCount: number
  moduleCount?: number
  moduleGrid?: CadModuleGrid
}

export interface CadCabinetType {
  typeId: string
  cadKey: string
  width_mm: number
  height_mm: number
  depth_mm?: number
  description?: string
}

export interface CadCabinetInstance {
  id: string
  instanceName?: string
  typeId: string
  x_mm: number
  y_mm: number
  z_mm: number
  rot_deg: number
  mirrored?: boolean
  suppressInCad?: boolean
  gridLabel?: string
  metadata?: Record<string, unknown>
}

export interface CadDrawing {
  createDrawing: boolean
  createPdf: boolean
  templateKey: string
  sheetFormat: string
  orientation: "landscape" | "portrait"
  viewSet: "requirements"
  drawingStyle: "requirements"
  primaryView: CadDrawingView
  includeFrontView: boolean
  includeRearView: boolean
  includeSideView: boolean
  includeTopView: boolean
  includeIso: boolean
}

export interface CadTitleBlock {
  projectName: string
  nc: string
  client: string
  endCustomer?: string
  siteName?: string
  location?: string
  screenWidth_mm: number
  screenHeight_mm: number
  screenDepth_mm: number
  pixelPitchLabel: string
  pitchMm: number
  mode: ProjectMode
  gob: boolean
  totalCabinetCount: number
  totalModuleCount?: number
  drawingTitle: string
  drawingSubtitle?: string
  revision: string
  drawBy?: string
  checkBy?: string
  date: string
  scaleHint?: string
  unit: "mm"
}

export interface CadEntry {
  id: string
  label: string
  type: CadEntryType
  color?: string
  cabinetId?: string
  x_mm: number
  y_mm: number
  z_mm: number
  side: CadEntrySide
  view: CadDrawingView
  anchorType: "cabinet_connector" | "absolute_point" | "custom"
  connectorName?: string
  leaderPreferredDirection?: CadLeaderDirection
  sourceRefs?: {
    powerFeedId?: string
    dataRouteId?: string
  }
}

export interface CadConnectorOffset {
  id: string
  targetEntryId: string
  view: Exclude<CadDrawingView, "iso">
  from: "left" | "right" | "top" | "bottom" | "origin"
  value_mm: number
}

export interface CadCustomDimension {
  id: string
  label: string
  orientation: "horizontal" | "vertical"
  view: Exclude<CadDrawingView, "iso">
  x1_mm: number
  y1_mm: number
  z1_mm: number
  x2_mm: number
  y2_mm: number
  z2_mm: number
}

export interface CadMountingHole {
  id: string
  label?: string
  cabinetId?: string
  x_mm: number
  y_mm: number
  z_mm: number
  diameter_mm?: number
  view: Exclude<CadDrawingView, "iso">
}

export interface CadDimensions {
  unit: "mm"
  overallWidth_mm: number
  overallHeight_mm: number
  overallDepth_mm: number
  showOverallWidth: boolean
  showOverallHeight: boolean
  showOverallDepth: boolean
  showMountingOffsets: boolean
  showConnectorOffsets: boolean
  connectorOffsets: CadConnectorOffset[]
  customDimensions: CadCustomDimension[]
  mountingHoles: CadMountingHole[]
}

export interface CadAnnotations {
  notes?: string[]
}

export interface CadExports {
  exportPdf?: boolean
  exportStep?: boolean
  exportDxf?: boolean
  outputSubfolder?: string
  namingMode?: "projectName" | "nc-projectName" | "nc"
}

export interface CadExport {
  schemaVersion: number
  project: CadProject
  assembly: CadAssembly
  layout: CadLayout
  cabinetTypes: CadCabinetType[]
  cabinets: CadCabinetInstance[]
  drawing: CadDrawing
  titleBlock: CadTitleBlock
  entries: CadEntry[]
  dimensions: CadDimensions
  annotations?: CadAnnotations
  exports?: CadExports
}

type ReceiverCardRect = {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
  connectorX: number
  connectorY: number
}

type ReceiverCardVariant = "indoor" | "outdoor"

const CAD_SCHEMA_VERSION = 3
const DEFAULT_DRAWING_TEMPLATE_KEY = "NUMMAX_STANDARD"
const DEFAULT_OUTPUT_SUBFOLDER = "03_Plans"
const REQUIREMENTS_VIEW_SET = "requirements"
const DEFAULT_DRAWING_TITLE = "LED SCREEN REQUIREMENTS"
const ENTRY_GROUPING_TOLERANCE_MM = 160

function roundMm(value: number) {
  return Number(value.toFixed(3))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatPixelPitch(layout: LayoutData) {
  const pitch = layout.project.pitch_mm
  const base = Number.isFinite(pitch) ? `P${pitch}` : "P?"
  return layout.project.pitch_is_gob ? `${base} GOB` : base
}

function getProjectName(layout: LayoutData) {
  const name = layout.project.name?.trim()
  return name && name.length > 0 ? name : "Unnamed Layout"
}

function getClientName(layout: LayoutData) {
  const exportClient = layout.project.exportSettings.clientName?.trim()
  if (exportClient) return exportClient
  const projectClient = layout.project.client?.trim()
  return projectClient || "Unknown"
}

function extractNc(projectName: string) {
  const match = projectName.match(/NC\s*([0-9]+)/i) ?? projectName.match(/([0-9]{3,})/)
  return match?.[1] ?? match?.[0] ?? "Unknown"
}

function getSheetFormat(layout: LayoutData) {
  return layout.project.exportSettings.pageSize ?? "A3"
}

function getLayoutDepth(layout: LayoutData) {
  const depths = layout.cabinetTypes
    .map((type) => type.depth_mm)
    .filter((depth): depth is number => typeof depth === "number" && Number.isFinite(depth) && depth > 0)
  if (depths.length === 0) return 90
  return Math.max(...depths)
}

function buildInstanceMetadata(layout: LayoutData, cabinetId: string) {
  const cabinet = layout.cabinets.find((item) => item.id === cabinetId)
  if (!cabinet) return undefined

  const metadata: Record<string, unknown> = {}
  if (cabinet.screenId) metadata.screenId = cabinet.screenId
  if (cabinet.face) metadata.face = cabinet.face
  if (cabinet.port !== undefined) metadata.port = cabinet.port
  if (cabinet.chainIndex !== undefined) metadata.chainIndex = cabinet.chainIndex
  if (cabinet.receiverCardCount !== undefined) metadata.receiverCardCount = cabinet.receiverCardCount

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function getRouteSteps(route: LayoutData["project"]["dataRoutes"][number]): DataRouteStep[] {
  if (route.manualMode && route.steps && route.steps.length > 0) return route.steps
  return route.cabinetIds.map((endpointId) => ({ type: "cabinet", endpointId }))
}

function getPowerSteps(feed: LayoutData["project"]["powerFeeds"][number]): DataRouteStep[] {
  if (feed.manualMode && feed.steps && feed.steps.length > 0) return feed.steps
  return feed.assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
}

function isCompactOutdoorCabinetBounds(bounds: { width: number; height: number }) {
  return bounds.height <= 400 && bounds.width >= bounds.height * 2
}

function getReceiverCardRect(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  heightFraction = 0.28,
  variant: ReceiverCardVariant = "indoor",
): ReceiverCardRect {
  const isCompactOutdoor = variant === "outdoor" && isCompactOutdoorCabinetBounds(bounds)
  const maxWidth =
    variant === "outdoor"
      ? Math.min((isCompactOutdoor ? 106 : 68) / zoom, bounds.width * (isCompactOutdoor ? 0.64 : 0.55))
      : Math.min(84 / zoom, bounds.width * 0.65)
  const minWidth =
    variant === "outdoor"
      ? Math.min((isCompactOutdoor ? 48 : 30) / zoom, maxWidth)
      : Math.min(40 / zoom, maxWidth)
  const maxHeight =
    variant === "outdoor"
      ? Math.min(
          (isCompactOutdoor ? 40 : 29) / zoom,
          bounds.height * (heightFraction + (isCompactOutdoor ? 0.18 : 0.11)),
        )
      : Math.min(18 / zoom, bounds.height * heightFraction)
  const minHeight =
    variant === "outdoor"
      ? Math.min((isCompactOutdoor ? 22 : 16.5) / zoom, maxHeight)
      : Math.min(12 / zoom, maxHeight)
  const cardWidth =
    variant === "outdoor"
      ? Math.min(maxWidth, Math.max(minWidth, bounds.width * (isCompactOutdoor ? 0.52 : 0.42)))
      : Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
  const cardHeight =
    variant === "outdoor"
      ? Math.min(maxHeight, Math.max(minHeight, bounds.height * (isCompactOutdoor ? 0.38 : 0.297)))
      : Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
  const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
  const cardCenterY =
    variant === "outdoor" ? bounds.y + Math.min(160, bounds.height / 2) : bounds.y + bounds.height / 2
  const cardY = cardCenterY - cardHeight / 2
  const connectorX = cardX + cardWidth / 2
  const connectorY = cardY + cardHeight + 6 / zoom

  return {
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    centerX: cardX + cardWidth / 2,
    centerY: cardY + cardHeight / 2,
    connectorX,
    connectorY,
  }
}

function getReceiverCardRects(
  bounds: { x: number; y: number; width: number; height: number } | null,
  zoom: number,
  count: 0 | 1 | 2,
  variant: ReceiverCardVariant = "indoor",
): ReceiverCardRect[] {
  if (!bounds || count <= 0) return []
  const heightFraction = count === 2 ? 0.2 : 0.26
  const base = getReceiverCardRect(bounds, zoom, heightFraction, variant)
  if (count === 1) return [base]

  const gap = Math.min(10 / zoom, base.height)
  const totalHeight = base.height * 2 + gap
  const targetCenterY =
    variant === "outdoor" ? bounds.y + Math.min(160, bounds.height / 2) : bounds.y + bounds.height / 2
  const startY = targetCenterY - totalHeight / 2
  const cardX = base.x
  const connectorOffset = 6 / zoom

  const top: ReceiverCardRect = {
    ...base,
    x: cardX,
    y: startY,
    centerX: cardX + base.width / 2,
    centerY: startY + base.height / 2,
    connectorX: cardX + base.width / 2,
    connectorY: startY + base.height + connectorOffset,
  }
  const bottomY = startY + base.height + gap
  const bottom: ReceiverCardRect = {
    ...base,
    x: cardX,
    y: bottomY,
    centerX: cardX + base.width / 2,
    centerY: bottomY + base.height / 2,
    connectorX: cardX + base.width / 2,
    connectorY: bottomY + base.height + connectorOffset,
  }
  return [top, bottom]
}

function getOutdoorReceiverCardDataPorts(rect: ReceiverCardRect, zoom: number) {
  const bodyH = Math.max(13 / zoom, rect.height * 0.97)
  const bodyW = Math.min(rect.width * 0.72, bodyH * 1.45)
  const bodyX = rect.centerX - bodyW / 2
  const portW = Math.max(5 / zoom, bodyW * 0.16)
  const portH = Math.max(3 / zoom, bodyH * 0.16)
  const portGap = Math.max(5 / zoom, bodyH * 0.58)
  const portX = bodyX - portW * 0.9
  const topPortY = rect.centerY - portGap / 2 - portH
  const anchorX = portX + portW * 0.5

  return {
    in: { x: anchorX, y: topPortY + portH * 0.5 },
  }
}

function getCabinetDataAnchorPoint(
  cabinet: Cabinet,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  cardIndex?: number,
  cardVariant: ReceiverCardVariant = "indoor",
) {
  const cardCount = getCabinetReceiverCardCount(cabinet)
  if (cardCount > 0) {
    const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
    const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
    const anchorRect = rects[resolvedIndex]
    if (anchorRect) {
      if (cardVariant === "outdoor") {
        const ports = getOutdoorReceiverCardDataPorts(anchorRect, zoom)
        return {
          x: ports.in.x,
          y: ports.in.y,
          resolvedIndex,
          isVirtual: false,
        }
      }
      return {
        x: anchorRect.connectorX,
        y: anchorRect.connectorY,
        resolvedIndex,
        isVirtual: false,
      }
    }
  }

  const override = cabinet.dataAnchorOverride
  return {
    x: bounds.x + bounds.width * clamp(override?.x ?? 0.5, 0, 1),
    y: bounds.y + bounds.height * clamp(override?.y ?? 0.5, 0, 1),
    resolvedIndex: undefined,
    isVirtual: true,
  }
}

function getPowerAnchorPoint(
  cardRect: ReceiverCardRect,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  const laneInset = Math.min(18 / zoom, bounds.width * 0.22)
  const anchorX = bounds.x + laneInset
  const laneYOffset = Math.max(10 / zoom, cardRect.height * 0.9)
  const minY = bounds.y + Math.max(10 / zoom, bounds.height * 0.1)
  const maxY = bounds.y + bounds.height - Math.max(10 / zoom, bounds.height * 0.1)
  const anchorY = clamp(cardRect.y + cardRect.height + laneYOffset, minY, maxY)
  return { x: anchorX, y: anchorY }
}

function resolveEntryLeaderDirection(
  explicitPosition: "auto" | "top" | "bottom" | "left" | "right" | undefined,
  point: { x: number; y: number },
  layoutBounds: { minX: number; minY: number; maxX: number; maxY: number },
): CadLeaderDirection {
  const horizontal = point.x <= (layoutBounds.minX + layoutBounds.maxX) / 2 ? "right" : "left"
  const vertical = point.y >= (layoutBounds.minY + layoutBounds.maxY) / 2 ? "bottom" : "top"
  if (!explicitPosition || explicitPosition === "auto") return `${vertical}-${horizontal}` as CadLeaderDirection
  if (explicitPosition === "left" || explicitPosition === "right") return `${vertical}-${explicitPosition}` as CadLeaderDirection
  if (explicitPosition === "top" || explicitPosition === "bottom") return `${explicitPosition}-${horizontal}` as CadLeaderDirection
  return `${vertical}-${horizontal}` as CadLeaderDirection
}

function buildModuleGrid(layout: LayoutData, layoutWidth: number, layoutHeight: number): CadModuleGrid | undefined {
  const { moduleWidth, moduleHeight, moduleOrientation } = getOrientedModuleSize(
    layout.project.overview.moduleSize,
    layout.project.overview.moduleOrientation,
  )
  if (moduleWidth <= 0 || moduleHeight <= 0) return undefined

  let totalModules = 0
  for (const cabinet of layout.cabinets) {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return undefined
    const cols = bounds.width / moduleWidth
    const rows = bounds.height / moduleHeight
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return undefined
    totalModules += cols * rows
  }

  const moduleCols = layoutWidth / moduleWidth
  const moduleRows = layoutHeight / moduleHeight

  return {
    moduleWidth_mm: moduleWidth,
    moduleHeight_mm: moduleHeight,
    moduleCols: Number.isInteger(moduleCols) ? moduleCols : undefined,
    moduleRows: Number.isInteger(moduleRows) ? moduleRows : undefined,
    totalModules,
    patternOrientation: moduleOrientation,
  }
}

function buildDataEntries(
  layout: LayoutData,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): CadEntry[] {
  const variant: ReceiverCardVariant = (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor"

  return layout.project.dataRoutes.flatMap<CadEntry>((route) => {
    const steps = getRouteSteps(route)
    const firstStep = steps[0]
    if (!firstStep) return []

    if (firstStep.type === "point") {
      return [
        {
          id: `ENTRY_DATA_${route.id}`,
          label: `DATA #${route.port} ENTRY`,
          type: "data",
          color: "blue",
          x_mm: roundMm(firstStep.x_mm - bounds.minX),
          y_mm: roundMm(firstStep.y_mm - bounds.minY),
          z_mm: 0,
          side: "rear",
          view: "rear",
          anchorType: "absolute_point",
          connectorName: `DATA_IN_${route.port}`,
          leaderPreferredDirection: resolveEntryLeaderDirection(
            route.labelPosition,
            { x: firstStep.x_mm, y: firstStep.y_mm },
            bounds,
          ),
          sourceRefs: { dataRouteId: route.id },
        },
      ]
    }

    const { cabinetId, cardIndex } = parseRouteCabinetId(firstStep.endpointId)
    const cabinet = layout.cabinets.find((item) => item.id === cabinetId)
    if (!cabinet) return []
    const cabinetBounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!cabinetBounds) return []
    const anchor = getCabinetDataAnchorPoint(cabinet, cabinetBounds, 1, cardIndex, variant)
    const point = { x: anchor.x, y: anchor.y }

    return [
      {
        id: `ENTRY_DATA_${route.id}`,
        label: `DATA #${route.port} ENTRY`,
        type: "data",
        color: "blue",
        cabinetId,
        x_mm: roundMm(anchor.x - bounds.minX),
        y_mm: roundMm(anchor.y - bounds.minY),
        z_mm: 0,
        side: "rear",
        view: "rear",
        anchorType: anchor.isVirtual ? "custom" : "cabinet_connector",
        connectorName: `DATA_IN_${route.port}`,
        leaderPreferredDirection: resolveEntryLeaderDirection(route.labelPosition, point, bounds),
        sourceRefs: { dataRouteId: route.id },
      },
    ]
  })
}

function buildPowerEntries(
  layout: LayoutData,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): CadEntry[] {
  return layout.project.powerFeeds.flatMap<CadEntry>((feed, index) => {
    const steps = getPowerSteps(feed)
    const firstStep = steps[0]
    if (!firstStep) return []

    if (firstStep.type === "point") {
      return [
        {
          id: `ENTRY_POWER_${feed.id}`,
          label: `POWER #${index + 1} ENTRY`,
          type: "power",
          color: "red",
          x_mm: roundMm(firstStep.x_mm - bounds.minX),
          y_mm: roundMm(firstStep.y_mm - bounds.minY),
          z_mm: 0,
          side: "rear",
          view: "rear",
          anchorType: "absolute_point",
          connectorName: feed.connector?.trim() || `POWER_IN_${index + 1}`,
          leaderPreferredDirection: resolveEntryLeaderDirection(
            feed.labelPosition,
            { x: firstStep.x_mm, y: firstStep.y_mm },
            bounds,
          ),
          sourceRefs: { powerFeedId: feed.id },
        },
      ]
    }

    const cabinet = layout.cabinets.find((item) => item.id === firstStep.endpointId)
    if (!cabinet) return []
    const cabinetBounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!cabinetBounds) return []

    const cardCount = getCabinetReceiverCardCount(cabinet)
    const rects = getReceiverCardRects(cabinetBounds, 1, cardCount)
    const layoutMidY = (bounds.minY + bounds.maxY) / 2
    const anchorRect =
      rects.length === 0
        ? undefined
        : rects.length === 1
          ? rects[0]
          : cabinetBounds.y + cabinetBounds.height / 2 > layoutMidY
            ? rects[1]
            : rects[0]
    const point = anchorRect ? getPowerAnchorPoint(anchorRect, cabinetBounds, 1) : {
      x: cabinetBounds.x + cabinetBounds.width / 2,
      y: cabinetBounds.y + cabinetBounds.height / 2,
    }

    return [
      {
        id: `ENTRY_POWER_${feed.id}`,
        label: `POWER #${index + 1} ENTRY`,
        type: "power",
        color: "red",
        cabinetId: cabinet.id,
        x_mm: roundMm(point.x - bounds.minX),
        y_mm: roundMm(point.y - bounds.minY),
        z_mm: 0,
        side: "rear",
        view: "rear",
        anchorType: anchorRect ? "cabinet_connector" : "custom",
        connectorName: feed.connector?.trim() || `POWER_IN_${index + 1}`,
        leaderPreferredDirection: resolveEntryLeaderDirection(feed.labelPosition, point, bounds),
        sourceRefs: { powerFeedId: feed.id },
      },
    ]
  })
}

function buildConnectorOffsets(
  entries: CadEntry[],
  layoutWidth: number,
  layoutHeight: number,
): CadConnectorOffset[] {
  return entries.flatMap((entry) => [
    {
      id: `DIM_${entry.id}_LEFT`,
      targetEntryId: entry.id,
      view: "rear",
      from: "left",
      value_mm: roundMm(entry.x_mm),
    },
    {
      id: `DIM_${entry.id}_TOP`,
      targetEntryId: entry.id,
      view: "rear",
      from: "top",
      value_mm: roundMm(layoutHeight - entry.y_mm),
    },
    {
      id: `DIM_${entry.id}_RIGHT`,
      targetEntryId: entry.id,
      view: "rear",
      from: "right",
      value_mm: roundMm(layoutWidth - entry.x_mm),
    },
  ])
}

function getPowerFeedNumberById(layout: LayoutData) {
  return new Map(layout.project.powerFeeds.map((feed, index) => [feed.id, index + 1]))
}

function getDataRouteNumberById(layout: LayoutData) {
  return new Map(layout.project.dataRoutes.map((route) => [route.id, route.port]))
}

function getEntryDistance(a: CadEntry, b: CadEntry) {
  return Math.hypot(a.x_mm - b.x_mm, a.y_mm - b.y_mm)
}

function canMergeEntries(powerEntry: CadEntry, dataEntry: CadEntry) {
  if (powerEntry.view !== dataEntry.view || powerEntry.side !== dataEntry.side) return false
  if (powerEntry.cabinetId && dataEntry.cabinetId) {
    return powerEntry.cabinetId === dataEntry.cabinetId && getEntryDistance(powerEntry, dataEntry) <= ENTRY_GROUPING_TOLERANCE_MM
  }
  if (powerEntry.cabinetId || dataEntry.cabinetId) return false
  return getEntryDistance(powerEntry, dataEntry) <= ENTRY_GROUPING_TOLERANCE_MM
}

function mergePowerAndDataEntries(layout: LayoutData, powerEntries: CadEntry[], dataEntries: CadEntry[]) {
  const powerFeedNumberById = getPowerFeedNumberById(layout)
  const dataRouteNumberById = getDataRouteNumberById(layout)
  const remainingDataEntries = [...dataEntries]
  const mergedEntries: CadEntry[] = []

  powerEntries.forEach((powerEntry) => {
    let bestMatchIndex = -1
    let bestMatchDistance = Number.POSITIVE_INFINITY

    remainingDataEntries.forEach((dataEntry, index) => {
      if (!canMergeEntries(powerEntry, dataEntry)) return
      const distance = getEntryDistance(powerEntry, dataEntry)
      if (distance < bestMatchDistance) {
        bestMatchDistance = distance
        bestMatchIndex = index
      }
    })

    if (bestMatchIndex === -1) {
      mergedEntries.push(powerEntry)
      return
    }

    const dataEntry = remainingDataEntries.splice(bestMatchIndex, 1)[0]
    const powerNumber = powerEntry.sourceRefs?.powerFeedId
      ? powerFeedNumberById.get(powerEntry.sourceRefs.powerFeedId)
      : undefined
    const dataNumber = dataEntry.sourceRefs?.dataRouteId
      ? dataRouteNumberById.get(dataEntry.sourceRefs.dataRouteId)
      : undefined

    mergedEntries.push({
      id: `ENTRY_PD_${powerEntry.sourceRefs?.powerFeedId ?? powerEntry.id}_${dataEntry.sourceRefs?.dataRouteId ?? dataEntry.id}`,
      label: `POWER #${powerNumber ?? "?"} & DATA #${dataNumber ?? "?"} ENTRY`,
      type: "power_data",
      color: powerEntry.color,
      cabinetId: powerEntry.cabinetId ?? dataEntry.cabinetId,
      x_mm: powerEntry.x_mm,
      y_mm: powerEntry.y_mm,
      z_mm: powerEntry.z_mm,
      side: powerEntry.side,
      view: powerEntry.view,
      anchorType:
        powerEntry.anchorType === "absolute_point" && dataEntry.anchorType === "absolute_point"
          ? "absolute_point"
          : powerEntry.anchorType !== "custom"
            ? powerEntry.anchorType
            : dataEntry.anchorType,
      connectorName: [powerEntry.connectorName, dataEntry.connectorName].filter(Boolean).join(" & ") || undefined,
      leaderPreferredDirection: powerEntry.leaderPreferredDirection ?? dataEntry.leaderPreferredDirection,
      sourceRefs: {
        powerFeedId: powerEntry.sourceRefs?.powerFeedId,
        dataRouteId: dataEntry.sourceRefs?.dataRouteId,
      },
    })
  })

  return [...mergedEntries, ...remainingDataEntries]
}

function buildTitleBlock(
  layout: LayoutData,
  projectName: string,
  clientName: string,
  nc: string,
  layoutWidth: number,
  layoutHeight: number,
  layoutDepth: number,
  moduleGrid: CadModuleGrid | undefined,
): CadTitleBlock {
  const drawingTitle = layout.project.exportSettings.title?.trim() || DEFAULT_DRAWING_TITLE

  return {
    projectName,
    nc,
    client: clientName,
    screenWidth_mm: layoutWidth,
    screenHeight_mm: layoutHeight,
    screenDepth_mm: layoutDepth,
    pixelPitchLabel: formatPixelPitch(layout),
    pitchMm: layout.project.pitch_mm,
    mode: layout.project.mode ?? "indoor",
    gob: layout.project.pitch_is_gob ?? false,
    totalCabinetCount: layout.cabinets.length,
    totalModuleCount: moduleGrid?.totalModules,
    drawingTitle,
    drawingSubtitle: "Rear requirements view",
    revision: "A",
    date: new Date().toISOString().slice(0, 10),
    unit: "mm",
  }
}

export function buildCadExport(layout: LayoutData): CadExport {
  const bounds = getLayoutBounds(layout)
  const totalDepth = getLayoutDepth(layout)
  const usedTypeIds = new Set(layout.cabinets.map((cabinet) => cabinet.typeId))
  const projectName = getProjectName(layout)
  const clientName = getClientName(layout)
  const nc = extractNc(projectName)
  const moduleGrid = buildModuleGrid(layout, bounds.width, bounds.height)
  const primaryView: CadDrawingView = "rear"

  const cabinets = layout.cabinets.map((cabinet, index) => ({
    id: cabinet.id,
    instanceName: `CAB-${String(index + 1).padStart(3, "0")}`,
    typeId: cabinet.typeId,
    x_mm: roundMm(cabinet.x_mm - bounds.minX),
    y_mm: roundMm(cabinet.y_mm - bounds.minY),
    z_mm: 0,
    rot_deg: cabinet.rot_deg,
    gridLabel: cabinet.gridLabelOverride?.trim() || undefined,
    metadata: buildInstanceMetadata(layout, cabinet.id),
  }))

  const dataEntries = buildDataEntries(layout, bounds)
  const powerEntries = buildPowerEntries(layout, bounds)
  const entries = mergePowerAndDataEntries(layout, powerEntries, dataEntries)
  const connectorOffsets = buildConnectorOffsets(entries, bounds.width, bounds.height)

  return {
    schemaVersion: CAD_SCHEMA_VERSION,
    project: {
      name: projectName,
      nc,
      client: clientName,
      mode: layout.project.mode ?? "indoor",
      units: "mm",
      pixelPitch: formatPixelPitch(layout),
      pitchMm: Number.isFinite(layout.project.pitch_mm) ? layout.project.pitch_mm : undefined,
      gob: layout.project.pitch_is_gob || undefined,
    },
    assembly: {
      origin: "bottom-left",
      coordinatesAreFinal: true,
      defaultZ_mm: 0,
      rotationUnit: "deg",
    },
    layout: {
      totalWidth_mm: bounds.width,
      totalHeight_mm: bounds.height,
      totalDepth_mm: totalDepth,
      cabinetCount: layout.cabinets.length,
      moduleCount: moduleGrid?.totalModules,
      moduleGrid,
    },
    cabinetTypes: layout.cabinetTypes.filter((type) => usedTypeIds.has(type.typeId)).map((type) => ({
      typeId: type.typeId,
      cadKey: type.cadKey?.trim() || type.typeId,
      width_mm: type.width_mm,
      height_mm: type.height_mm,
      depth_mm: type.depth_mm ?? 90,
      description: type.description?.trim() || undefined,
    })),
    cabinets,
    drawing: {
      createDrawing: true,
      createPdf: true,
      templateKey: DEFAULT_DRAWING_TEMPLATE_KEY,
      sheetFormat: getSheetFormat(layout),
      orientation: layout.project.exportSettings.orientation ?? "landscape",
      viewSet: REQUIREMENTS_VIEW_SET,
      drawingStyle: "requirements",
      primaryView,
      includeFrontView: false,
      includeRearView: true,
      includeSideView: true,
      includeTopView: false,
      includeIso: false,
    },
    titleBlock: buildTitleBlock(layout, projectName, clientName, nc, bounds.width, bounds.height, totalDepth, moduleGrid),
    entries,
    dimensions: {
      unit: "mm",
      overallWidth_mm: bounds.width,
      overallHeight_mm: bounds.height,
      overallDepth_mm: totalDepth,
      showOverallWidth: true,
      showOverallHeight: true,
      showOverallDepth: true,
      showMountingOffsets: false,
      showConnectorOffsets: connectorOffsets.length > 0,
      connectorOffsets,
      customDimensions: [],
      mountingHoles: [],
    },
    annotations: {
      notes: [
        "ENTRY LABELS ARE FINAL DRAWING LABELS.",
        "ENTRY COORDINATES ARE RESOLVED IN MM FROM THE NORMALIZED LAYOUT ORIGIN.",
      ],
    },
    exports: {
      exportPdf: true,
      exportStep: false,
      exportDxf: false,
      outputSubfolder: DEFAULT_OUTPUT_SUBFOLDER,
      namingMode: "projectName",
    },
  }
}
