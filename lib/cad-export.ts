import { getLayoutBounds } from "./validation"
import type { LayoutData } from "./types"

export interface CadProject {
  name: string
  nc: string
  client: string
  mode: "indoor" | "outdoor"
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

export interface CadLayout {
  totalWidth_mm: number
  totalHeight_mm: number
  totalDepth_mm?: number
  cabinetCount: number
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
  metadata?: Record<string, unknown>
}

export interface CadDrawing {
  createDrawing: boolean
  createPdf: boolean
  templateKey: string
  sheetFormat: string
  orientation: "landscape" | "portrait"
  viewSet: string
  includeIso: boolean
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
  exports?: CadExports
}

const CAD_SCHEMA_VERSION = 2
const DEFAULT_DRAWING_TEMPLATE_KEY = "NUMMAX_STANDARD"
const DEFAULT_VIEW_SET = "standard_screen"
const DEFAULT_OUTPUT_SUBFOLDER = "03_Plans"

function formatPixelPitch(layout: LayoutData) {
  const pitch = layout.project.pitch_mm
  const base = Number.isFinite(pitch) ? `P${pitch}` : "P?"
  return layout.project.pitch_is_gob ? `${base} GOB` : base
}

function getProjectName(layout: LayoutData) {
  const name = layout.project.name?.trim()
  return name && name.length > 0 ? name : "Unnamed Layout"
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

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function buildCadExport(layout: LayoutData): CadExport {
  const bounds = getLayoutBounds(layout)
  const totalDepth = getLayoutDepth(layout)
  const usedTypeIds = new Set(layout.cabinets.map((cabinet) => cabinet.typeId))
  const projectName = getProjectName(layout)
  const clientName = layout.project.client?.trim() || "Unknown"

  return {
    schemaVersion: CAD_SCHEMA_VERSION,
    project: {
      name: projectName,
      nc: extractNc(projectName),
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
    },
    cabinetTypes: layout.cabinetTypes.filter((type) => usedTypeIds.has(type.typeId)).map((type) => ({
      typeId: type.typeId,
      cadKey: type.cadKey?.trim() || type.typeId,
      width_mm: type.width_mm,
      height_mm: type.height_mm,
      depth_mm: type.depth_mm ?? 90,
      description: type.description?.trim() || undefined,
    })),
    cabinets: layout.cabinets.map((cabinet, index) => ({
      id: cabinet.id,
      instanceName: `CAB-${String(index + 1).padStart(3, "0")}`,
      typeId: cabinet.typeId,
      x_mm: cabinet.x_mm - bounds.minX,
      y_mm: cabinet.y_mm - bounds.minY,
      z_mm: 0,
      rot_deg: cabinet.rot_deg,
      metadata: buildInstanceMetadata(layout, cabinet.id),
    })),
    drawing: {
      createDrawing: true,
      createPdf: true,
      templateKey: DEFAULT_DRAWING_TEMPLATE_KEY,
      sheetFormat: getSheetFormat(layout),
      orientation: layout.project.exportSettings.orientation ?? "landscape",
      viewSet: DEFAULT_VIEW_SET,
      includeIso: true,
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
