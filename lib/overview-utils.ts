import type { Cabinet, LabelsMode, LayoutData } from "./types"
import { getCabinetReceiverCardCount } from "./types"
import { getCabinetBounds, getLayoutBounds } from "./validation"

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
  positions.forEach((item) => {
    const col = nearestIndex(columnValues, item.x)
    const row = nearestIndex(rowValues, item.y)
    labels.set(item.id, `${columnLabel(col)}${row + 1}`)
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
  return model && model.length > 0 ? model : "5A75-E"
}

export function getLayoutPixelDimensions(layout: LayoutData) {
  const bounds = getLayoutBounds(layout)
  const pitch = layout.project.pitch_mm || 0
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
    parts.push(`${pitch} GOB`)
  }
  return parts
}

export function shouldShowGridLabels(labelsMode: LabelsMode) {
  return labelsMode === "grid"
}
