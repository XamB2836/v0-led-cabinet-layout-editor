// Core data types for LED Cabinet Layout Editor
import { DEFAULT_RECEIVER_CARD_MODEL } from "./receiver-cards"

export interface CabinetType {
  typeId: string
  width_mm: number
  height_mm: number
}

export interface Cabinet {
  id: string
  typeId: string
  x_mm: number
  y_mm: number
  rot_deg: 0 | 90 | 180 | 270
  screenId?: string // optional logical screen grouping (used for double-face workflows)
  face?: "A" | "B" // optional display face marker for outdoor double-face
  port?: number
  chainIndex?: number
  receiverCardCount?: 0 | 1 | 2
  receiverCardOverride?: string | null // null = hide, undefined = use global, string = custom label
  dataAnchorOverride?: { x: number; y: number } // normalized (0..1) anchor for data routes when no receiver card
  gridLabelOverride?: string
}

export interface GridSettings {
  enabled: boolean
  step_mm: number
}

export type LabelsMode = "internal" | "grid"
export type GridLabelAxis = "columns" | "rows"
export type ModuleSize = "320x160" | "160x160" | "320x320"

export type MappingNumbersMode = "auto" | "manual"
export type MappingNumbersFontSize = "small" | "medium" | "large"
export type MappingNumbersPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom"

export interface MappingNumbersManualAssignments {
  perChain: Record<string, string>
  perEndpoint: Record<string, string>
}

export interface MappingNumbersPositionOverride {
  position?: MappingNumbersPosition
  x?: number
  y?: number
}

export interface MappingNumbersSettings {
  show: boolean
  mode: MappingNumbersMode
  restartPerCard: boolean
  labels?: number[]
  fontSize: MappingNumbersFontSize
  position: MappingNumbersPosition
  badge: boolean
  manualValue?: string
  applyToChain?: boolean
  manualAssignments?: MappingNumbersManualAssignments
  positionOverrides?: Record<string, MappingNumbersPositionOverride>
}

export interface OverviewSettings {
  showReceiverCards: boolean
  receiverCardModel: string
  labelsMode: LabelsMode
  showCabinetLabels: boolean
  gridLabelAxis: GridLabelAxis
  showPixels: boolean
  showDataRoutes: boolean
  forcePortLabelsBottom: boolean
  showPowerRoutes: boolean
  showModuleGrid: boolean
  numberOfDisplays: number
  moduleSize: ModuleSize
  moduleOrientation: "landscape" | "portrait"
  mappingNumbers: MappingNumbersSettings
}

export type DataRouteStep =
  | { type: "cabinet"; endpointId: string }
  | { type: "point"; x_mm: number; y_mm: number }

export interface DataRoute {
  id: string
  port: number
  forcePortLabelBottom?: boolean
  labelPosition?: "auto" | "top" | "bottom" | "left" | "right"
  cabinetIds: string[] // ordered cabinet endpoint IDs in chain
  manualMode?: boolean
  steps?: DataRouteStep[] // ordered route steps (points/cabinets) for manual routing
}

export interface PowerFeed {
  id: string
  label: string
  customLabel?: string
  breaker?: string
  connector: string
  consumptionW: number
  loadOverrideW?: number
  assignedCabinetIds: string[]
  manualMode?: boolean
  steps?: DataRouteStep[]
  positionX?: number // X position for the power line (auto-calculated or manual)
  labelPosition?: "auto" | "top" | "bottom" | "left" | "right"
}

export interface ExportSettings {
  pageSize: "A4" | "A3"
  orientation: "portrait" | "landscape"
  viewSide: "front" | "back"
  title: string
  clientName: string
  showLegend?: boolean
}

export type ProjectMode = "indoor" | "outdoor"

export interface Project {
  mode: ProjectMode
  name: string
  client?: string
  units: "mm"
  pitch_mm: number
  pitch_is_gob: boolean
  controller: "A100" | "A200" | "X8E"
  controllerLabel?: string
  controllerPlacement?: "external" | "cabinet"
  controllerCabinetId?: string
  grid: GridSettings
  overview: OverviewSettings
  dataRoutes: DataRoute[]
  powerFeeds: PowerFeed[]
  exportSettings: ExportSettings
}

export interface LayoutData {
  schemaVersion: number
  project: Project
  cabinetTypes: CabinetType[]
  cabinets: Cabinet[]
}

export interface ValidationError {
  type: "error" | "warning"
  code: "OVERLAP" | "OUT_OF_GRID" | "MISSING_TYPE" | "DUPLICATE_ID" | "ISOLATED_CABINET"
  message: string
  cabinetIds: string[]
}

export type RoutingMode = { type: "none" } | { type: "data"; routeId: string } | { type: "power"; feedId: string }

export interface EditorState {
  layout: LayoutData
  selectedCabinetId: string | null
  selectedCabinetIds: string[]
  zoom: number
  panX: number
  panY: number
  isDragging: boolean
  draggedCabinetId: string | null
  history: LayoutData[]
  historyIndex: number
  showDimensions: boolean
  routingMode: RoutingMode
}

// Default cabinet types
const DEFAULT_WIDTHS_MM = [1280, 1120, 960, 800, 640, 480, 320, 160]
const DEFAULT_HEIGHTS_MM = [640, 480, 320, 160]

export const DEFAULT_CABINET_TYPES: CabinetType[] = DEFAULT_HEIGHTS_MM.flatMap((height) =>
  DEFAULT_WIDTHS_MM.map((width) => ({
    typeId: `STD_${width}x${height}`,
    width_mm: width,
    height_mm: height,
  })),
)

export const DEFAULT_LAYOUT: LayoutData = {
  schemaVersion: 3,
  project: {
    mode: "indoor",
    name: "NC",
    client: "",
    units: "mm",
    pitch_mm: 2.5,
    pitch_is_gob: true,
    controller: "A100",
    controllerLabel: "",
    controllerPlacement: "external",
    grid: { enabled: true, step_mm: 160 },
    overview: {
      showReceiverCards: true,
      receiverCardModel: DEFAULT_RECEIVER_CARD_MODEL,
      labelsMode: "grid",
      showCabinetLabels: true,
      gridLabelAxis: "columns",
      showPixels: true,
      showDataRoutes: true,
      forcePortLabelsBottom: false,
      showPowerRoutes: true,
      showModuleGrid: true,
      numberOfDisplays: 1,
      moduleSize: "320x160",
      moduleOrientation: "portrait",
      mappingNumbers: {
        show: false,
        mode: "auto",
        restartPerCard: true,
        labels: [1, 3, 5, 7, 9, 11, 13, 15],
        fontSize: "medium",
        position: "top-right",
        badge: true,
        manualValue: "",
        applyToChain: true,
        manualAssignments: { perChain: {}, perEndpoint: {} },
        positionOverrides: {},
      },
    },
    dataRoutes: [],
    powerFeeds: [],
    exportSettings: {
      pageSize: "A4",
      orientation: "portrait",
      viewSide: "front",
      title: "",
      clientName: "",
      showLegend: true,
    },
  },
  cabinetTypes: [...DEFAULT_CABINET_TYPES],
  cabinets: [],
}

export function computeGridLabel(
  cabinet: Cabinet,
  allCabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  gridLabelAxis: GridLabelAxis = "columns",
): string {
  const override = cabinet.gridLabelOverride?.trim()
  if (override) return override

  const cabinetsWithBounds = allCabinets
    .map((c) => {
      const type = cabinetTypes.find((t) => t.typeId === c.typeId)
      if (!type) return null
      return { cabinet: c, x: c.x_mm, y: c.y_mm }
    })
    .filter(Boolean) as { cabinet: Cabinet; x: number; y: number }[]

  if (cabinetsWithBounds.length === 0) return "?"

  const tolerance = 50 // mm tolerance for grouping
  const columns: number[] = []
  const rows: number[] = []

  cabinetsWithBounds.forEach(({ x, y }) => {
    const existingCol = columns.find((c) => Math.abs(c - x) < tolerance)
    if (existingCol === undefined) columns.push(x)

    const existingRow = rows.find((r) => Math.abs(r - y) < tolerance)
    if (existingRow === undefined) rows.push(y)
  })

  columns.sort((a, b) => a - b)
  rows.sort((a, b) => a - b)

  const thisCabinet = cabinetsWithBounds.find((c) => c.cabinet.id === cabinet.id)
  if (!thisCabinet) return "?"

  const colIndex = columns.findIndex((c) => Math.abs(c - thisCabinet.x) < tolerance)
  const rowIndex = rows.findIndex((r) => Math.abs(r - thisCabinet.y) < tolerance)

  if (colIndex === -1 || rowIndex === -1) return "?"

  const columnLabel = (index: number) => {
    let label = ""
    let n = index + 1
    while (n > 0) {
      const rem = (n - 1) % 26
      label = String.fromCharCode(65 + rem) + label
      n = Math.floor((n - 1) / 26)
    }
    return label
  }

  const letterIndex = gridLabelAxis === "rows" ? rowIndex : colIndex
  const numberIndex = gridLabelAxis === "rows" ? colIndex : rowIndex
  const letter = columnLabel(letterIndex)
  const number = numberIndex + 1
  return `${letter}${number}`
}

const CABINET_ENDPOINT_DELIMITER = "::"

export function formatRouteCabinetId(cabinetId: string, cardIndex?: number) {
  if (cardIndex === undefined) return cabinetId
  return `${cabinetId}${CABINET_ENDPOINT_DELIMITER}${cardIndex + 1}`
}

export function parseRouteCabinetId(endpointId: string): { cabinetId: string; cardIndex?: number } {
  const delimiterIndex = endpointId.indexOf(CABINET_ENDPOINT_DELIMITER)
  if (delimiterIndex === -1) {
    return { cabinetId: endpointId }
  }
  const cabinetId = endpointId.slice(0, delimiterIndex)
  const cardPart = endpointId.slice(delimiterIndex + CABINET_ENDPOINT_DELIMITER.length)
  const cardNumber = Number.parseInt(cardPart, 10)
  if (!Number.isFinite(cardNumber) || cardNumber <= 0) {
    return { cabinetId: endpointId }
  }
  return { cabinetId, cardIndex: cardNumber - 1 }
}

export function getCabinetReceiverCardCount(cabinet: Cabinet): 0 | 1 | 2 {
  if (cabinet.receiverCardOverride === null) return 0
  if (cabinet.receiverCardCount === 0) return 0
  if (cabinet.receiverCardCount === 2) return 2
  return 1
}
