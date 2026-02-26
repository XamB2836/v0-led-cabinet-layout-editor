import type { LayoutData } from "./types"
import { getCabinetBounds } from "./validation"
import { getEffectivePitchMm } from "./pitch-utils"

type CabinetBounds = NonNullable<ReturnType<typeof getCabinetBounds>>

function areCabinetBoundsConnected(a: CabinetBounds, b: CabinetBounds) {
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

function getConnectedGroups(cabinetBounds: CabinetBounds[]) {
  const visited = new Array(cabinetBounds.length).fill(false)
  const groups: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = []

  for (let i = 0; i < cabinetBounds.length; i++) {
    if (visited[i]) continue
    visited[i] = true

    const queue = [i]
    let minX = cabinetBounds[i].x
    let minY = cabinetBounds[i].y
    let maxX = cabinetBounds[i].x2
    let maxY = cabinetBounds[i].y2

    while (queue.length > 0) {
      const currentIndex = queue.shift()
      if (currentIndex === undefined) continue
      const current = cabinetBounds[currentIndex]
      minX = Math.min(minX, current.x)
      minY = Math.min(minY, current.y)
      maxX = Math.max(maxX, current.x2)
      maxY = Math.max(maxY, current.y2)

      for (let j = 0; j < cabinetBounds.length; j++) {
        if (visited[j]) continue
        if (!areCabinetBoundsConnected(current, cabinetBounds[j])) continue
        visited[j] = true
        queue.push(j)
      }
    }

    groups.push({ minX, minY, maxX, maxY })
  }

  return groups
}

export function getTotalizedPixelMatrixDimensions(layout: LayoutData) {
  const pitchMm = getEffectivePitchMm(layout.project.pitch_mm || 0)
  if (!pitchMm || layout.cabinets.length === 0) {
    return { widthPx: 0, heightPx: 0 }
  }

  const cabinetBounds = layout.cabinets
    .map((cabinet) => getCabinetBounds(cabinet, layout.cabinetTypes))
    .filter((bounds): bounds is CabinetBounds => bounds !== null)

  if (cabinetBounds.length === 0) {
    return { widthPx: 0, heightPx: 0 }
  }

  if ((layout.project.mode ?? "indoor") !== "indoor") {
    let minX = cabinetBounds[0].x
    let minY = cabinetBounds[0].y
    let maxX = cabinetBounds[0].x2
    let maxY = cabinetBounds[0].y2
    for (let i = 1; i < cabinetBounds.length; i++) {
      const bounds = cabinetBounds[i]
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x2)
      maxY = Math.max(maxY, bounds.y2)
    }
    return {
      widthPx: Math.round((maxX - minX) / pitchMm),
      heightPx: Math.round((maxY - minY) / pitchMm),
    }
  }

  const groups = getConnectedGroups(cabinetBounds)
  type RowBand = { minY: number; maxY: number; widthMm: number }
  const rowToleranceMm = 1
  const rows: RowBand[] = []
  const sortedGroups = [...groups].sort((a, b) => a.minY - b.minY)

  sortedGroups.forEach((group) => {
    const groupWidthMm = group.maxX - group.minX
    const targetRow = rows.find(
      (row) => !(group.minY > row.maxY + rowToleranceMm || group.maxY < row.minY - rowToleranceMm),
    )

    if (targetRow) {
      targetRow.widthMm += groupWidthMm
      targetRow.minY = Math.min(targetRow.minY, group.minY)
      targetRow.maxY = Math.max(targetRow.maxY, group.maxY)
    } else {
      rows.push({ minY: group.minY, maxY: group.maxY, widthMm: groupWidthMm })
    }
  })

  const totalWidthMm = rows.reduce((max, row) => Math.max(max, row.widthMm), 0)
  const totalHeightMm = rows.reduce((sum, row) => sum + (row.maxY - row.minY), 0)

  return {
    widthPx: Math.round(totalWidthMm / pitchMm),
    heightPx: Math.round(totalHeightMm / pitchMm),
  }
}
