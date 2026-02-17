import type { Cabinet, LabelsMode, LayoutData } from "./types"
import { getCabinetReceiverCardCount } from "./types"
import { getCabinetBounds, getLayoutBounds } from "./validation"
import { getEffectivePitchMm } from "./pitch-utils"
import { DEFAULT_RECEIVER_CARD_MODEL } from "./receiver-cards"

const LABEL_TOLERANCE_MM = 1

function groupPositions(values: number[], tolerance = LABEL_TOLERANCE_MM) {
  const sorted = [...values].sort((a, b) => a - b)
  const groups: number[] = []
  sorted.forEach((value) => {
    const last = groups[groups.length - 1]
    if (last === undefined || Math.abs(value - last) > tolerance) {
      groups.push(value)
    }
  })
  return groups
}

function nearestIndex(values: number[], target: number) {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  values.forEach((value, index) => {
    const distance = Math.abs(value - target)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

function columnLabel(index: number) {
  let label = ""
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

export function getGridLabelMap(layout: LayoutData) {
  const positions = layout.cabinets
    .map((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      return bounds ? { id: cabinet.id, x: bounds.x, y: bounds.y } : null
    })
    .filter((item): item is { id: string; x: number; y: number } => item !== null)

  const columnValues = groupPositions(positions.map((item) => item.x))
  const rowValues = groupPositions(positions.map((item) => item.y))

  const labels = new Map<string, string>()
  const gridLabelAxis = layout.project.overview.gridLabelAxis ?? "columns"
  positions.forEach((item) => {
    const col = nearestIndex(columnValues, item.x)
    const row = nearestIndex(rowValues, item.y)
    const letterIndex = gridLabelAxis === "rows" ? row : col
    const numberIndex = gridLabelAxis === "rows" ? col : row
    labels.set(item.id, `${columnLabel(letterIndex)}${numberIndex + 1}`)
  })
  return labels
}

export function getReceiverCardLabel(layout: LayoutData, cabinet: Cabinet) {
  if (!layout.project.overview.showReceiverCards) return null
  if (getCabinetReceiverCardCount(cabinet) === 0) return null
  if (cabinet.receiverCardOverride === null) return null
  if (cabinet.receiverCardOverride && cabinet.receiverCardOverride.trim().length > 0) {
    return cabinet.receiverCardOverride.trim()
  }
  const model = layout.project.overview.receiverCardModel?.trim()
  return model && model.length > 0 ? model : DEFAULT_RECEIVER_CARD_MODEL
}

export function getLayoutPixelDimensions(layout: LayoutData) {
  const bounds = getLayoutBounds(layout)
  const pitch = getEffectivePitchMm(layout.project.pitch_mm || 0)
  if (!pitch) {
    return { width_px: 0, height_px: 0 }
  }
  return {
    width_px: Math.round(bounds.width / pitch),
    height_px: Math.round(bounds.height / pitch),
  }
}

export function getTitleParts(layout: LayoutData) {
  const bounds = getLayoutBounds(layout)
  const pitch = layout.project.pitch_mm
  const parts = [layout.project.name || "Overview"]
  if (layout.project.client) {
    parts.push(layout.project.client)
  }
  if (bounds.width > 0 && bounds.height > 0) {
    parts.push(`${bounds.width}x${bounds.height} mm`)
  }
  if (pitch) {
    const isGob = layout.project.pitch_is_gob ?? false
    parts.push(`P${pitch}${isGob ? " GOB" : ""}`)
  }
  return parts
}

export function shouldShowGridLabels(labelsMode: LabelsMode) {
  return labelsMode === "grid"
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getOverviewReadabilityScale(layout: LayoutData) {
  if (layout.cabinets.length === 0) return 1.04

  const bounds = getLayoutBounds(layout)
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const shortSide = Math.min(width, height)
  const longSide = Math.max(width, height)
  const areaM2 = (width * height) / 1_000_000
  const density = layout.cabinets.length / Math.max(areaM2, 0.2)

  let scale = 1.06
  if (shortSide <= 400) scale = 1.34
  else if (shortSide <= 700) scale = 1.26
  else if (shortSide <= 1000) scale = 1.2
  else if (shortSide <= 1600) scale = 1.12

  if (layout.cabinets.length <= 4) scale += 0.08
  else if (layout.cabinets.length <= 8) scale += 0.04
  else if (layout.cabinets.length >= 32) scale -= 0.04

  if (density >= 14) scale *= 0.92
  else if (density >= 8) scale *= 0.96
  else if (density <= 2.5) scale *= 1.06

  const aspectRatio = longSide / Math.max(shortSide, 1)
  if (aspectRatio >= 4 && layout.cabinets.length <= 6) {
    scale += 0.08
  }

  return clamp(scale, 1.0, 1.38)
}
