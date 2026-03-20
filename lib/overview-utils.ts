import type { Cabinet, LabelsMode, LayoutData } from "./types"
import { getCabinetReceiverCardCount } from "./types"
import { getCabinetBounds, getLayoutBounds } from "./validation"
import { getProjectHardwareDefaults } from "./modes"
import { getTotalizedPixelMatrixDimensions } from "./pixel-matrix"

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
  if (model && model.length > 0) return model
  return getProjectHardwareDefaults(layout.project.mode ?? "indoor", layout.project.outdoorHardwareProfile ?? "standard")
    .receiverCardModel
}

export function getLayoutPixelDimensions(layout: LayoutData) {
  const matrix = getTotalizedPixelMatrixDimensions(layout)
  return {
    width_px: matrix.widthPx,
    height_px: matrix.heightPx,
  }
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }

function getBoundsFromCabinets(cabinets: Cabinet[], layout: LayoutData): Bounds | null {
  if (cabinets.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x2)
    maxY = Math.max(maxY, bounds.y2)
  })

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function areBoundsConnected(
  a: { x: number; y: number; x2: number; y2: number },
  b: { x: number; y: number; x2: number; y2: number },
) {
  const tolerance = 1
  const overlapX = a.x < b.x2 && a.x2 > b.x
  const overlapY = a.y < b.y2 && a.y2 > b.y
  if (overlapX && overlapY) return true

  const horizontalTouch =
    (Math.abs(a.x2 - b.x) <= tolerance || Math.abs(b.x2 - a.x) <= tolerance) && !(a.y2 <= b.y || b.y2 <= a.y)
  const verticalTouch =
    (Math.abs(a.y2 - b.y) <= tolerance || Math.abs(b.y2 - a.y) <= tolerance) && !(a.x2 <= b.x || b.x2 <= a.x)
  return horizontalTouch || verticalTouch
}

function getTitleBounds(layout: LayoutData): Bounds {
  const fullBounds = getLayoutBounds(layout)
  if (layout.cabinets.length === 0) return fullBounds
  if (!(layout.project.exportSettings.doubleSidedTitle ?? false)) return fullBounds

  const faceA = layout.cabinets.filter((cabinet) => cabinet.face === "A")
  const faceB = layout.cabinets.filter((cabinet) => cabinet.face === "B")
  if (faceA.length > 0 && faceB.length > 0) {
    const preferredFace = (layout.project.exportSettings.viewSide ?? "front") === "back" ? faceB : faceA
    const byFace = getBoundsFromCabinets(preferredFace, layout)
    if (byFace) return byFace
  }

  const withBounds = layout.cabinets
    .map((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      return bounds ? { cabinet, bounds } : null
    })
    .filter((entry): entry is { cabinet: Cabinet; bounds: { x: number; y: number; x2: number; y2: number } } => !!entry)

  if (withBounds.length < 2) return fullBounds

  const visited = new Array(withBounds.length).fill(false)
  const components: Bounds[] = []
  for (let i = 0; i < withBounds.length; i++) {
    if (visited[i]) continue
    visited[i] = true
    const queue = [i]
    let minX = withBounds[i].bounds.x
    let minY = withBounds[i].bounds.y
    let maxX = withBounds[i].bounds.x2
    let maxY = withBounds[i].bounds.y2

    while (queue.length > 0) {
      const currentIndex = queue.shift()
      if (currentIndex === undefined) continue
      const current = withBounds[currentIndex].bounds
      minX = Math.min(minX, current.x)
      minY = Math.min(minY, current.y)
      maxX = Math.max(maxX, current.x2)
      maxY = Math.max(maxY, current.y2)

      for (let j = 0; j < withBounds.length; j++) {
        if (visited[j]) continue
        if (!areBoundsConnected(current, withBounds[j].bounds)) continue
        visited[j] = true
        queue.push(j)
      }
    }

    components.push({ minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY })
  }

  if (components.length === 2) {
    const [first, second] = components
    const sameWidth = Math.abs(first.width - second.width) <= 1
    const sameHeight = Math.abs(first.height - second.height) <= 1
    if (sameWidth && sameHeight) {
      return first.minY <= second.minY ? first : second
    }
  }

  return fullBounds
}

export function getTitleParts(layout: LayoutData) {
  const bounds = getTitleBounds(layout)
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

  let scale = 1.02
  if (shortSide <= 400) scale = 1.14
  else if (shortSide <= 700) scale = 1.1
  else if (shortSide <= 1000) scale = 1.07
  else if (shortSide <= 1600) scale = 1.03

  if (layout.cabinets.length <= 4) scale += 0.03
  else if (layout.cabinets.length <= 8) scale += 0.02
  else if (layout.cabinets.length >= 32) scale -= 0.03

  if (density >= 14) scale *= 0.94
  else if (density >= 8) scale *= 0.97
  else if (density <= 2.5) scale *= 1.02

  const aspectRatio = longSide / Math.max(shortSide, 1)
  if (aspectRatio >= 4 && layout.cabinets.length <= 6) {
    scale += 0.03
  }

  if (layout.cabinets.length <= 2 && shortSide <= 450) {
    scale *= 0.84
  } else if (layout.cabinets.length <= 4 && shortSide <= 600) {
    scale *= 0.9
  }

  if (areaM2 <= 0.45) {
    scale *= 0.94
  }

  return clamp(scale, 0.86, 1.18)
}
