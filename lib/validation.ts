import type { Cabinet, CabinetType, LayoutData, ValidationError } from "./types"

function inferCabinetTypeFromId(typeId: string): CabinetType | null {
  const match = typeId.match(/(\d+)\s*x\s*(\d+)/i)
  if (!match) return null
  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    typeId,
    width_mm: width,
    height_mm: height,
  }
}

// Get the bounding box of a cabinet considering rotation
export function getCabinetBounds(cabinet: Cabinet, types: CabinetType[]) {
  const type = types.find((t) => t.typeId === cabinet.typeId) ?? inferCabinetTypeFromId(cabinet.typeId)
  if (!type) return null

  const isRotated = cabinet.rot_deg === 90 || cabinet.rot_deg === 270
  const width = isRotated ? type.height_mm : type.width_mm
  const height = isRotated ? type.width_mm : type.height_mm

  return {
    x: cabinet.x_mm,
    y: cabinet.y_mm,
    width,
    height,
    x2: cabinet.x_mm + width,
    y2: cabinet.y_mm + height,
  }
}

// Check if two rectangles overlap
function rectsOverlap(
  a: { x: number; y: number; x2: number; y2: number },
  b: { x: number; y: number; x2: number; y2: number },
): boolean {
  return a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y
}

// Check if two cabinets are adjacent (touching but not overlapping)
function areAdjacent(
  a: { x: number; y: number; x2: number; y2: number },
  b: { x: number; y: number; x2: number; y2: number },
): boolean {
  const tolerance = 1 // 1mm tolerance

  // Check horizontal adjacency
  const horizontallyAdjacent =
    (Math.abs(a.x2 - b.x) <= tolerance || Math.abs(b.x2 - a.x) <= tolerance) && !(a.y2 <= b.y || b.y2 <= a.y)

  // Check vertical adjacency
  const verticallyAdjacent =
    (Math.abs(a.y2 - b.y) <= tolerance || Math.abs(b.y2 - a.y) <= tolerance) && !(a.x2 <= b.x || b.x2 <= a.x)

  return horizontallyAdjacent || verticallyAdjacent
}

export function validateLayout(layout: LayoutData): ValidationError[] {
  const errors: ValidationError[] = []
  const { cabinets, cabinetTypes, project } = layout

  // Check for duplicate IDs
  const idCounts = new Map<string, string[]>()
  cabinets.forEach((c) => {
    const existing = idCounts.get(c.id) || []
    idCounts.set(c.id, [...existing, c.id])
  })
  idCounts.forEach((ids, id) => {
    if (ids.length > 1) {
      errors.push({
        type: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate cabinet ID: ${id}`,
        cabinetIds: [id],
      })
    }
  })

  // Check for missing types
  cabinets.forEach((c) => {
    const knownType = cabinetTypes.find((t) => t.typeId === c.typeId)
    const inferredType = knownType ? null : inferCabinetTypeFromId(c.typeId)
    if (!knownType && !inferredType) {
      errors.push({
        type: "error",
        code: "MISSING_TYPE",
        message: `Cabinet ${c.id} has unknown type: ${c.typeId}`,
        cabinetIds: [c.id],
      })
    }
  })

  // Check for overlaps
  for (let i = 0; i < cabinets.length; i++) {
    const boundsA = getCabinetBounds(cabinets[i], cabinetTypes)
    if (!boundsA) continue

    for (let j = i + 1; j < cabinets.length; j++) {
      const boundsB = getCabinetBounds(cabinets[j], cabinetTypes)
      if (!boundsB) continue

      if (rectsOverlap(boundsA, boundsB)) {
        errors.push({
          type: "error",
          code: "OVERLAP",
          message: `Cabinets ${cabinets[i].id} and ${cabinets[j].id} overlap`,
          cabinetIds: [cabinets[i].id, cabinets[j].id],
        })
      }
    }
  }

  // Check for out-of-grid alignment
  if (project.grid.enabled) {
    const step = project.grid.step_mm
    cabinets.forEach((c) => {
      if (c.x_mm % step !== 0 || c.y_mm % step !== 0) {
        errors.push({
          type: "warning",
          code: "OUT_OF_GRID",
          message: `Cabinet ${c.id} is not aligned to grid (${step}mm)`,
          cabinetIds: [c.id],
        })
      }
    })
  }

  // Check for isolated cabinets (warning)
  cabinets.forEach((c) => {
    const boundsC = getCabinetBounds(c, cabinetTypes)
    if (!boundsC) return

    const hasNeighbor = cabinets.some((other) => {
      if (other.id === c.id) return false
      const boundsOther = getCabinetBounds(other, cabinetTypes)
      if (!boundsOther) return false
      return areAdjacent(boundsC, boundsOther)
    })

    if (!hasNeighbor && cabinets.length > 1) {
      errors.push({
        type: "warning",
        code: "ISOLATED_CABINET",
        message: `Cabinet ${c.id} has no adjacent neighbors`,
        cabinetIds: [c.id],
      })
    }
  })

  return errors
}

// Calculate bounding box of all cabinets
export function getLayoutBounds(layout: LayoutData) {
  if (layout.cabinets.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  }

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY

  layout.cabinets.forEach((c) => {
    const bounds = getCabinetBounds(c, layout.cabinetTypes)
    if (bounds) {
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x2)
      maxY = Math.max(maxY, bounds.y2)
    }
  })

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
