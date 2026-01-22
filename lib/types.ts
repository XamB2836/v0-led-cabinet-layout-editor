// Core data types for LED Cabinet Layout Editor

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

export interface OverviewSettings {
  showReceiverCards: boolean
  receiverCardModel: string
  labelsMode: LabelsMode
  showCabinetLabels: boolean
  showPixels: boolean
  showDataRoutes: boolean
  forcePortLabelsBottom: boolean
  showPowerRoutes: boolean
  showModuleGrid: boolean
  moduleSize: "320x160" | "160x160"
  moduleOrientation: "landscape" | "portrait"
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
  breaker?: string
  connector: string
  consumptionW: number
  assignedCabinetIds: string[]
  positionX?: number // X position for the power line (auto-calculated or manual)
  labelPosition?: "auto" | "top" | "bottom" | "left" | "right"
}

export interface ExportSettings {
  pageSize: "A4" | "A3"
  orientation: "portrait" | "landscape"
  viewSide: "front" | "back"
  title: string
  clientName: string
  breakerNumber?: string
  controllerLabel?: string
}

export interface Project {
  name: string
  client?: string
  units: "mm"
  pitch_mm: number
  pitch_is_gob: boolean
  controller: "A100" | "A200"
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
  schemaVersion: 2,
  project: {
    name: "NC",
    client: "",
    units: "mm",
    pitch_mm: 2.5,
    pitch_is_gob: true,
    controller: "A100",
    controllerPlacement: "external",
    grid: { enabled: true, step_mm: 160 },
    overview: {
      showReceiverCards: true,
      receiverCardModel: "5A75-E",
      labelsMode: "grid",
      showCabinetLabels: true,
      showPixels: true,
      showDataRoutes: true,
      forcePortLabelsBottom: false,
      showPowerRoutes: true,
      showModuleGrid: true,
      moduleSize: "320x160",
      moduleOrientation: "portrait",
    },
    dataRoutes: [],
    powerFeeds: [],
    exportSettings: {
      pageSize: "A4",
      orientation: "portrait",
      viewSide: "front",
      title: "",
      clientName: "",
      breakerNumber: "",
      controllerLabel: "",
    },
  },
  cabinetTypes: [...DEFAULT_CABINET_TYPES],
  cabinets: [],
}

export function computeGridLabel(cabinet: Cabinet, allCabinets: Cabinet[], cabinetTypes: CabinetType[]): string {
  const override = cabinet.gridLabelOverride?.trim()
  if (override) return override

  const cabinetsWithBounds = allCabinets
    .map((c) => {
      const type = cabinetTypes.find((t) => t.typeId === c.typeId)
      if (!type) return null
      const isRotated = c.rot_deg === 90 || c.rot_deg === 270
      const w = isRotated ? type.height_mm : type.width_mm
      const h = isRotated ? type.width_mm : type.height_mm
      return {
        cabinet: c,
        centerX: c.x_mm + w / 2,
        centerY: c.y_mm + h / 2,
      }
    })
    .filter(Boolean) as { cabinet: Cabinet; centerX: number; centerY: number }[]

  if (cabinetsWithBounds.length === 0) return "?"

  // Get unique columns (X centers) and rows (Y centers) with tolerance
  const tolerance = 50 // mm tolerance for grouping
  const columns: number[] = []
  const rows: number[] = []

  cabinetsWithBounds.forEach(({ centerX, centerY }) => {
    // Check columns
    const existingCol = columns.find((c) => Math.abs(c - centerX) < tolerance)
    if (!existingCol) columns.push(centerX)

    // Check rows
    const existingRow = rows.find((r) => Math.abs(r - centerY) < tolerance)
    if (!existingRow) rows.push(centerY)
  })

  // Sort columns left to right
  columns.sort((a, b) => a - b)
  // Y increases downward on the canvas, so smallest Y = top = row 1
  rows.sort((a, b) => a - b) // Ascending: smallest Y first (top row = row 1)

  // Find this cabinet's column and row
  const thisCabinet = cabinetsWithBounds.find((c) => c.cabinet.id === cabinet.id)
  if (!thisCabinet) return "?"

  const colIndex = columns.findIndex((c) => Math.abs(c - thisCabinet.centerX) < tolerance)
  const rowIndex = rows.findIndex((r) => Math.abs(r - thisCabinet.centerY) < tolerance)

  if (colIndex === -1 || rowIndex === -1) return "?"

  const useNumberForColumns = columns.length >= rows.length
  const letterIndex = useNumberForColumns ? rowIndex : colIndex
  const numberIndex = useNumberForColumns ? colIndex : rowIndex

  // Letter index (A, B, C...) and number index (1, 2, 3...)
  const letter = String.fromCharCode(65 + letterIndex) // A=65
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
