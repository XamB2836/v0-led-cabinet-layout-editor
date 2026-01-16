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
  receiverCardOverride?: string | null // null = hide, undefined = use global, string = custom label
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
  showPixels: boolean
  showDataRoutes: boolean
  showPowerRoutes: boolean
}

export interface DataRoute {
  id: string
  port: number
  cabinetIds: string[] // ordered cabinet IDs in chain
}

export interface PowerFeed {
  id: string
  label: string
  breaker?: string
  connector: string
  consumptionW: number
  assignedCabinetIds: string[]
  positionX?: number // X position for the power line (auto-calculated or manual)
}

export interface ExportSettings {
  pageSize: "A4" | "A3"
  orientation: "portrait" | "landscape"
  title: string
  clientName: string
}

export interface Project {
  name: string
  client?: string
  units: "mm"
  pitch_mm: number
  controller: "A100" | "A200"
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
export const DEFAULT_CABINET_TYPES: CabinetType[] = [
  { typeId: "STD_1120x640", width_mm: 1120, height_mm: 640 },
  { typeId: "STD_960x640", width_mm: 960, height_mm: 640 },
  { typeId: "STD_480x640", width_mm: 480, height_mm: 640 },
  { typeId: "STD_1280x640", width_mm: 1280, height_mm: 640 },
  { typeId: "STD_640x640", width_mm: 640, height_mm: 640 },
]

export const DEFAULT_LAYOUT: LayoutData = {
  schemaVersion: 2,
  project: {
    name: "New Layout",
    client: "",
    units: "mm",
    pitch_mm: 2.5,
    controller: "A200",
    grid: { enabled: true, step_mm: 160 },
    overview: {
      showReceiverCards: true,
      receiverCardModel: "5A75-E",
      labelsMode: "grid",
      showPixels: true,
      showDataRoutes: true,
      showPowerRoutes: true,
    },
    dataRoutes: [],
    powerFeeds: [],
    exportSettings: {
      pageSize: "A4",
      orientation: "portrait",
      title: "",
      clientName: "",
    },
  },
  cabinetTypes: [...DEFAULT_CABINET_TYPES],
  cabinets: [],
}

export function computeGridLabel(cabinet: Cabinet, allCabinets: Cabinet[], cabinetTypes: CabinetType[]): string {
  // Get all cabinet bounds
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
  // In our coordinate system, Y increases upward, so highest Y = top = row 1
  rows.sort((a, b) => b - a) // Descending: highest Y first (top row = row 1)

  // Find this cabinet's column and row
  const thisCabinet = cabinetsWithBounds.find((c) => c.cabinet.id === cabinet.id)
  if (!thisCabinet) return "?"

  const colIndex = columns.findIndex((c) => Math.abs(c - thisCabinet.centerX) < tolerance)
  const rowIndex = rows.findIndex((r) => Math.abs(r - thisCabinet.centerY) < tolerance)

  if (colIndex === -1 || rowIndex === -1) return "?"

  // Column letter (A, B, C...) and row number (1, 2, 3...)
  const colLetter = String.fromCharCode(65 + colIndex) // A=65
  const rowNumber = rowIndex + 1

  return `${colLetter}${rowNumber}`
}
