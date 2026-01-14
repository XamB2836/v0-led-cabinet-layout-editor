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
}

export interface GridSettings {
  enabled: boolean
  step_mm: number
}

export interface Project {
  name: string
  units: "mm"
  pitch_mm: number
  controller: string
  grid: GridSettings
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
  schemaVersion: 1,
  project: {
    name: "New Layout",
    units: "mm",
    pitch_mm: 2.5,
    controller: "A200",
    grid: { enabled: true, step_mm: 160 },
  },
  cabinetTypes: [...DEFAULT_CABINET_TYPES],
  cabinets: [],
}
