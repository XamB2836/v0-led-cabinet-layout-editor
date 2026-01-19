import type { Cabinet, CabinetType, DataRoute, LayoutData } from "./types"
import { getCabinetReceiverCardCount, parseRouteCabinetId } from "./types"
import { getLayoutBounds } from "./validation"

const PER_PORT_MAX_PX = 650_000
type ControllerType = LayoutData["project"]["controller"]

const CONTROLLER_LIMITS: Record<ControllerType, { totalMaxPx: number; maxWidthPx?: number; maxHeightPx?: number }> = {
  A100: { totalMaxPx: 1_300_000 },
  A200: { totalMaxPx: 2_300_000, maxWidthPx: 4096, maxHeightPx: 2560 },
}

function getCabinetPixelArea(cabinet: Cabinet, types: CabinetType[], pitchMm: number): number {
  const type = types.find((t) => t.typeId === cabinet.typeId)
  if (!type) return 0
  const isRotated = cabinet.rot_deg === 90 || cabinet.rot_deg === 270
  const widthMm = isRotated ? type.height_mm : type.width_mm
  const heightMm = isRotated ? type.width_mm : type.height_mm
  const widthPx = Math.round(widthMm / pitchMm)
  const heightPx = Math.round(heightMm / pitchMm)
  return widthPx * heightPx
}

export function getDataRouteLoadPx(
  route: DataRoute,
  cabinets: Cabinet[],
  types: CabinetType[],
  pitchMm: number,
): number {
  const cabinetMap = new Map(cabinets.map((c) => [c.id, c]))
  return route.cabinetIds.reduce((sum, endpointId) => {
    const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
    const cabinet = cabinetMap.get(cabinetId)
    if (!cabinet) return sum
    const cardCount = getCabinetReceiverCardCount(cabinet)
    if (cardCount === 0) return sum
    const effectiveCards = cardCount === 2 ? 2 : 1
    const load = getCabinetPixelArea(cabinet, types, pitchMm) / effectiveCards
    if (cardIndex === undefined && cardCount === 1) return sum + load
    return sum + load
  }, 0)
}

export function isDataRouteOverCapacity(
  route: DataRoute,
  cabinets: Cabinet[],
  types: CabinetType[],
  pitchMm: number,
): boolean {
  return getDataRouteLoadPx(route, cabinets, types, pitchMm) > PER_PORT_MAX_PX
}

export function getLayoutPixelLoad(cabinets: Cabinet[], types: CabinetType[], pitchMm: number): number {
  return cabinets.reduce((sum, cabinet) => sum + getCabinetPixelArea(cabinet, types, pitchMm), 0)
}

export function getControllerLimits(controller: ControllerType) {
  return CONTROLLER_LIMITS[controller]
}

export function isControllerOverCapacity(layout: LayoutData): boolean {
  return isLayoutOverControllerLimits(layout, layout.project.controller)
}

export function isLayoutOverControllerLimits(layout: LayoutData, controller: ControllerType): boolean {
  const limits = CONTROLLER_LIMITS[controller]
  const totalLoad = getLayoutPixelLoad(layout.cabinets, layout.cabinetTypes, layout.project.pitch_mm)
  if (totalLoad > limits.totalMaxPx) return true
  if (limits.maxWidthPx || limits.maxHeightPx) {
    const bounds = getLayoutBounds(layout)
    const widthPx = Math.round(bounds.width / layout.project.pitch_mm)
    const heightPx = Math.round(bounds.height / layout.project.pitch_mm)
    if (limits.maxWidthPx && widthPx > limits.maxWidthPx) return true
    if (limits.maxHeightPx && heightPx > limits.maxHeightPx) return true
  }
  return false
}
