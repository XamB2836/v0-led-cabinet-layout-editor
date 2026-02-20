import type { Cabinet, CabinetType, PowerFeed, ProjectMode } from "./types"

const POWER_DENSITY_W_M2_BY_MODE: Record<ProjectMode, number> = {
  indoor: 550,
  outdoor: 700,
}
const BREAKER_LIMITS: Record<string, { maxW: number }> = {
  "220V 20A": { maxW: 3520 },
  "110V 15A": { maxW: 1320 },
}

function getCabinetAreaM2(cabinet: Cabinet, types: CabinetType[]): number {
  const type = types.find((t) => t.typeId === cabinet.typeId)
  if (!type) return 0
  const isRotated = cabinet.rot_deg === 90 || cabinet.rot_deg === 270
  const width = isRotated ? type.height_mm : type.width_mm
  const height = isRotated ? type.width_mm : type.height_mm
  return (width * height) / 1_000_000
}

export function getPowerFeedLoadW(
  feed: PowerFeed,
  cabinets: Cabinet[],
  types: CabinetType[],
  mode: ProjectMode = "indoor",
): number {
  if (Number.isFinite(feed.loadOverrideW)) {
    return Math.round(feed.loadOverrideW as number)
  }
  const powerDensityWm2 = POWER_DENSITY_W_M2_BY_MODE[mode] ?? POWER_DENSITY_W_M2_BY_MODE.indoor
  const cabinetMap = new Map(cabinets.map((c) => [c.id, c]))
  const total = feed.assignedCabinetIds.reduce((sum, id) => {
    const cabinet = cabinetMap.get(id)
    if (!cabinet) return sum
    return sum + getCabinetAreaM2(cabinet, types) * powerDensityWm2
  }, 0)
  return Math.round(total)
}

export function getBreakerMaxW(breaker?: string | null): number | null {
  if (!breaker) return null
  const limit = BREAKER_LIMITS[breaker]
  return limit ? limit.maxW : null
}

export function isPowerFeedOverloaded(
  feed: PowerFeed,
  cabinets: Cabinet[],
  types: CabinetType[],
  mode: ProjectMode = "indoor",
): boolean {
  const maxW = getBreakerMaxW(feed.breaker)
  if (!maxW) return false
  return getPowerFeedLoadW(feed, cabinets, types, mode) > maxW
}
