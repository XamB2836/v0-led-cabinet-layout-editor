import type { Cabinet, CabinetType, ProjectMode } from "./types"
import { getCabinetBounds } from "./validation"

export function getDefaultOutdoorLvBoxCabinetId(
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): string | undefined {
  const candidates = cabinets
    .map((cabinet) => {
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return null
      return {
        id: cabinet.id,
        right: bounds.x + bounds.width,
        bottom: bounds.y + bounds.height,
      }
    })
    .filter((entry): entry is { id: string; right: number; bottom: number } => entry !== null)

  if (candidates.length === 0) return undefined

  candidates.sort((a, b) => {
    if (a.bottom !== b.bottom) return a.bottom - b.bottom
    return a.right - b.right
  })

  return candidates[candidates.length - 1]?.id
}

export function resolveControllerCabinetId(
  mode: ProjectMode,
  controllerPlacement: "external" | "cabinet" | undefined,
  controllerCabinetId: string | undefined,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): string | undefined {
  if (controllerPlacement !== "cabinet") return undefined

  if (controllerCabinetId && cabinets.some((cabinet) => cabinet.id === controllerCabinetId)) {
    return controllerCabinetId
  }

  if (mode === "outdoor") {
    return getDefaultOutdoorLvBoxCabinetId(cabinets, cabinetTypes)
  }

  return controllerCabinetId
}
