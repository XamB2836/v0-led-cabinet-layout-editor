import type { DataRoute, LayoutData } from "./types"
import { parseRouteCabinetId } from "./types"

// Mapping numbers represent the data group / HUB output group index for a receiver card chain.
// Auto mode assigns labels per data route (chain), optionally restarting per receiver card index.
// Manual mode uses per-chain / per-endpoint overrides stored in the layout.

function sortRoutes(routes: DataRoute[]) {
  return [...routes].sort((a, b) => a.port - b.port || a.id.localeCompare(b.id))
}

function buildOddSequence(count: number) {
  return Array.from({ length: count }, (_, index) => 1 + index * 2)
}

function buildLabelSequence(count: number, labels?: number[]) {
  const sanitized = (labels ?? []).filter((value) => Number.isFinite(value))
  if (sanitized.length >= count) return sanitized.slice(0, count)
  const next = buildOddSequence(count)
  const merged = [...sanitized]
  for (let i = merged.length; i < next.length; i++) {
    merged.push(next[i])
  }
  return merged.slice(0, count)
}

function getRouteCardGroup(route: DataRoute) {
  const counts = new Map<number, number>()
  route.cabinetIds.forEach((endpointId) => {
    const { cardIndex } = parseRouteCabinetId(endpointId)
    const key = cardIndex ?? 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  let bestKey = 0
  let bestCount = -1
  counts.forEach((count, key) => {
    if (count > bestCount || (count === bestCount && key < bestKey)) {
      bestKey = key
      bestCount = count
    }
  })
  return bestKey
}

export function findRouteIdForEndpoint(routes: DataRoute[], endpointId: string): string | null {
  const target = parseRouteCabinetId(endpointId)
  for (const route of routes) {
    const match = route.cabinetIds.some((candidate) => {
      const parsed = parseRouteCabinetId(candidate)
      return parsed.cabinetId === target.cabinetId && parsed.cardIndex === target.cardIndex
    })
    if (match) return route.id
  }
  return null
}

export function getMappingNumberLabelMap(layout: LayoutData) {
  const settings = layout.project.overview.mappingNumbers
  const labels = new Map<string, string>()
  if (!settings) return labels

  const perEndpoint = settings.manualAssignments?.perEndpoint ?? {}
  const perChain = settings.manualAssignments?.perChain ?? {}
  const routes = layout.project.dataRoutes ?? []

  if (settings.mode === "manual") {
    routes.forEach((route) => {
      route.cabinetIds.forEach((endpointId) => {
        const direct = perEndpoint[endpointId]
        const chain = perChain[route.id]
        const value = (direct ?? chain)?.toString().trim()
        if (value) {
          labels.set(endpointId, value)
        }
      })
    })

    Object.entries(perEndpoint).forEach(([endpointId, value]) => {
      const trimmed = value?.toString().trim()
      if (!trimmed || labels.has(endpointId)) return
      labels.set(endpointId, trimmed)
    })
    return labels
  }

  const activeRoutes = routes.filter((route) => route.cabinetIds.length > 0)
  if (activeRoutes.length === 0) return labels

  if (settings.restartPerCard) {
    const grouped = new Map<number, DataRoute[]>()
    sortRoutes(activeRoutes).forEach((route) => {
      const key = getRouteCardGroup(route)
      const group = grouped.get(key)
      if (group) {
        group.push(route)
      } else {
        grouped.set(key, [route])
      }
    })

    Array.from(grouped.keys())
      .sort((a, b) => a - b)
      .forEach((key) => {
        const groupRoutes = sortRoutes(grouped.get(key) ?? [])
        const sequence = buildLabelSequence(groupRoutes.length, settings.labels)
        groupRoutes.forEach((route, index) => {
          const label = String(sequence[index])
          route.cabinetIds.forEach((endpointId) => labels.set(endpointId, label))
        })
      })

    return labels
  }

  const orderedRoutes = sortRoutes(activeRoutes)
  const sequence = buildLabelSequence(orderedRoutes.length, settings.labels)
  orderedRoutes.forEach((route, index) => {
    const label = String(sequence[index])
    route.cabinetIds.forEach((endpointId) => labels.set(endpointId, label))
  })
  return labels
}
