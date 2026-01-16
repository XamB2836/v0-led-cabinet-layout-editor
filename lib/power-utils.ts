import type { Cabinet, CabinetType, PowerFeed } from "./types"

const POWER_DENSITY_W_M2 = 550
const BREAKER_LIMITS: Record<string, { maxW: number; safeW: number }> = {
  "220V 20A": { maxW: 3520, safeW: 2816 },
  "110V 15A": { maxW: 1650, safeW: 1320 },
}

function getCabinetAreaM2(cabinet: Cabinet, types: CabinetType[]): number {
  const type = types.find((t) => t.typeId === cabinet.typeId)
  if (!type) return 0
  const isRotated = cabinet.rot_deg === 90 || cabinet.rot_deg === 270
  const width = isRotated ? type.height_mm : type.width_mm
  const height = isRotated ? type.width_mm : type.height_mm
  return (width * height) / 1_000_000
}

export function getPowerFeedLoadW(feed: PowerFeed, cabinets: Cabinet[], types: CabinetType[]): number {
  const cabinetMap = new Map(cabinets.map((c) => [c.id, c]))
  const total = feed.assignedCabinetIds.reduce((sum, id) => {
    const cabinet = cabinetMap.get(id)
    if (!cabinet) return sum
    return sum + getCabinetAreaM2(cabinet, types) * POWER_DENSITY_W_M2
  }, 0)
  return Math.round(total)
}

export function getBreakerSafeMaxW(breaker?: string | null): number | null {
  if (!breaker) return null
  const limit = BREAKER_LIMITS[breaker]
  return limit ? limit.safeW : null
}
