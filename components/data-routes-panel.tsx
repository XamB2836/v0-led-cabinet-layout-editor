"use client"

import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, getLayoutBounds } from "@/lib/validation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Zap, Cable, Wand2, MousePointer, X, RotateCcw } from "lucide-react"
import type { DataRoute, DataRouteStep, LayoutData, PowerFeed } from "@/lib/types"
import {
  computeGridLabel,
  formatRouteCabinetId,
  getCabinetReceiverCardCount,
  parseRouteCabinetId,
} from "@/lib/types"
import { getBreakerMaxW, getPowerFeedLoadW } from "@/lib/power-utils"
import {
  getControllerLimits,
  getDataRouteLoadPx,
  getLayoutPixelLoad,
  isDataRouteOverCapacity,
  isLayoutOverControllerLimits,
} from "@/lib/data-utils"
import { getEffectivePitchMm } from "@/lib/pitch-utils"

export function DataRoutesPanel() {
  const { state, dispatch } = useEditor()
  const { layout, routingMode } = state
  const { dataRoutes, powerFeeds, controller } = layout.project
  const gridLabelAxis = layout.project.overview.gridLabelAxis ?? "columns"
  const activeRoute = routingMode.type === "data" ? dataRoutes.find((r) => r.id === routingMode.routeId) : null

  const controllerPorts: Record<LayoutData["project"]["controller"], number> = {
    A100: 2,
    A200: 4,
    X8E: 8,
  }
  const controllerOrder: LayoutData["project"]["controller"][] = ["A100", "A200", "X8E"]
  const maxPorts = controllerPorts[controller]
  const maxUsedPort = dataRoutes.reduce((max, route) => Math.max(max, route.port), 0)
  const invalidPorts = maxUsedPort > maxPorts
  const portUpgradeTarget = invalidPorts
    ? controllerOrder.find((type) => controllerPorts[type] >= maxUsedPort) ?? null
    : null
  const pitchMm = layout.project.pitch_mm
  const effectivePitchMm = getEffectivePitchMm(pitchMm)
  const controllerLimits = getControllerLimits(controller)
  const totalPixelLoad = getLayoutPixelLoad(layout.cabinets, layout.cabinetTypes, effectivePitchMm)
  const isOverCurrent = isLayoutOverControllerLimits(layout, controller)
  const capacityUpgradeTarget = isOverCurrent
    ? controllerOrder.find(
        (type) => type !== controller && !isLayoutOverControllerLimits(layout, type),
      ) ?? null
    : null
  const bounds = getLayoutBounds(layout)
  const layoutWidthPx = Math.round(bounds.width / effectivePitchMm)
  const layoutHeightPx = Math.round(bounds.height / effectivePitchMm)
  const routingBannerClass =
    routingMode.type === "data"
      ? "rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-500/10 via-zinc-900/80 to-zinc-900 p-3"
      : "rounded-xl border border-orange-400/30 bg-gradient-to-r from-orange-500/10 via-zinc-900/80 to-zinc-900 p-3"
  const routingTitleClass = routingMode.type === "data" ? "text-blue-300/80" : "text-orange-300/80"
  const routingDoneClass =
    routingMode.type === "data"
      ? "h-7 px-3 bg-blue-500/80 text-zinc-950 hover:bg-blue-400"
      : "h-7 px-3 bg-orange-500/80 text-zinc-950 hover:bg-orange-400"

  const getRouteSteps = (route: DataRoute): DataRouteStep[] => {
    if (route.steps && route.steps.length > 0) return route.steps
    return route.cabinetIds.map((endpointId) => ({ type: "cabinet", endpointId }))
  }

  const getCabinetIdsFromSteps = (steps: DataRouteStep[]) => {
    return steps.flatMap((step) => (step.type === "cabinet" ? [step.endpointId] : []))
  }

  const formatRouteEndpointLabel = (endpointId: string) => {
    const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
    const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
    if (!cabinet) return endpointId
    const label = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes, gridLabelAxis)
    if (cardIndex === undefined) {
      const cardCount = getCabinetReceiverCardCount(cabinet)
      return cardCount > 1 ? `${label}a` : label
    }
    const suffix = String.fromCharCode(97 + Math.max(0, cardIndex))
    return `${label}${suffix}`
  }

  const handleAutoRoute = () => {
    if (layout.cabinets.length === 0) return

    // Get cabinet positions and group by columns
    const cabinetsWithBounds = layout.cabinets
      .map((c) => {
        const bounds = getCabinetBounds(c, layout.cabinetTypes)
        if (!bounds) return null
        const cardCount = getCabinetReceiverCardCount(c)
        if (cardCount === 0) return null
        return {
          cabinet: c,
          cardCount,
          centerX: bounds.x + bounds.width / 2,
          centerY: bounds.y + bounds.height / 2,
          bounds,
        }
      })
      .filter(Boolean) as {
      cabinet: (typeof layout.cabinets)[0]
      cardCount: 0 | 1 | 2
      centerX: number
      centerY: number
      bounds: ReturnType<typeof getCabinetBounds>
    }[]

    // Group by columns (X position with tolerance)
    const tolerance = 100
    const columns: (typeof cabinetsWithBounds)[] = []

    cabinetsWithBounds.forEach((item) => {
      const existingCol = columns.find((col) => col.length > 0 && Math.abs(col[0].centerX - item.centerX) < tolerance)
      if (existingCol) {
        existingCol.push(item)
      } else {
        columns.push([item])
      }
    })

    // Sort columns left to right
    columns.sort((a, b) => a[0].centerX - b[0].centerX)
    // Order each column bottom -> top (higher Y is lower on the canvas)
    columns.forEach((col) => col.sort((a, b) => b.centerY - a.centerY))

    // Distribute columns across available ports
    const newRoutes: DataRoute[] = []
    const portsToUse = Math.min(maxPorts, columns.length)

    for (let portIndex = 0; portIndex < portsToUse; portIndex++) {
      const colsPerPort = Math.ceil(columns.length / portsToUse)
      const startCol = portIndex * colsPerPort
      const endCol = Math.min(startCol + colsPerPort, columns.length)

      const cabinetIds: string[] = []
      for (let c = startCol; c < endCol; c++) {
        // Alternate direction for snake pattern
        const isReversed = (c - startCol) % 2 === 1
        const colCabinets = [...columns[c]]
        if (isReversed) {
          colCabinets.reverse()
        }
        const cardOrder = isReversed ? [0, 1] : [1, 0]

        colCabinets.forEach((item) => {
          if (item.cardCount === 1) {
            cabinetIds.push(item.cabinet.id)
            return
          }
          cardOrder.forEach((index) => {
            if (index >= item.cardCount) return
            cabinetIds.push(formatRouteCabinetId(item.cabinet.id, index))
          })
        })
      }

      if (cabinetIds.length > 0) {
        newRoutes.push({
          id: `route-${portIndex + 1}`,
          port: portIndex + 1,
          cabinetIds,
        })
      }
    }

    // Clear existing routes
    layout.project.dataRoutes.forEach((r) => {
      dispatch({ type: "DELETE_DATA_ROUTE", payload: r.id })
    })

    // Add new routes
    newRoutes.forEach((route) => {
      dispatch({ type: "ADD_DATA_ROUTE", payload: route })
    })

    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleAddRoute = () => {
    const usedPorts = new Set(dataRoutes.map((r) => r.port))
    let nextPort = 1
    while (usedPorts.has(nextPort) && nextPort <= maxPorts) nextPort++

    if (nextPort > maxPorts) return

    const newRoute: DataRoute = {
      id: `route-${Date.now()}`,
      port: nextPort,
      cabinetIds: [],
    }
    dispatch({ type: "ADD_DATA_ROUTE", payload: newRoute })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDeleteRoute = (id: string) => {
    dispatch({ type: "DELETE_DATA_ROUTE", payload: id })
    // Exit routing mode if deleting active route
    if (routingMode.type === "data" && routingMode.routeId === id) {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleStartRouting = (routeId: string) => {
    dispatch({ type: "SET_ROUTING_MODE", payload: { type: "data", routeId } })
  }

  const handleStopRouting = () => {
    dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleClearRoute = (routeId: string) => {
    dispatch({ type: "UPDATE_DATA_ROUTE", payload: { id: routeId, updates: { cabinetIds: [] } } })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleRouteLabelPosition = (routeId: string, position: "auto" | "top" | "bottom" | "left" | "right") => {
    dispatch({
      type: "UPDATE_DATA_ROUTE",
      payload: {
        id: routeId,
        updates: { labelPosition: position === "auto" ? undefined : position, forcePortLabelBottom: undefined },
      },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleManualModeToggle = (routeId: string, enabled: boolean) => {
    const route = dataRoutes.find((r) => r.id === routeId)
    if (!route) return
    const steps = enabled ? getRouteSteps(route) : route.steps
    const cabinetIds = enabled && steps ? getCabinetIdsFromSteps(steps) : route.cabinetIds
    dispatch({
      type: "UPDATE_DATA_ROUTE",
      payload: {
        id: routeId,
        updates: { manualMode: enabled, steps, cabinetIds },
      },
    })
    if (enabled) {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "data", routeId } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleClearManualPoints = (routeId: string) => {
    const route = dataRoutes.find((r) => r.id === routeId)
    if (!route?.steps || route.steps.length === 0) return
    const nextSteps = route.steps.filter((step) => step.type === "cabinet")
    dispatch({
      type: "UPDATE_DATA_ROUTE",
      payload: {
        id: routeId,
        updates: { steps: nextSteps, cabinetIds: getCabinetIdsFromSteps(nextSteps) },
      },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const getManualPointCount = (route: DataRoute) => {
    return route.steps?.filter((step) => step.type === "point").length ?? 0
  }

  const getPowerSteps = (feed: PowerFeed): DataRouteStep[] => {
    if (feed.steps && feed.steps.length > 0) return feed.steps
    return feed.assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
  }

  const getPowerCabinetIdsFromSteps = (steps: DataRouteStep[]) => {
    return steps.flatMap((step) => (step.type === "cabinet" ? [step.endpointId] : []))
  }

  const getPowerPointCount = (feed: PowerFeed) => {
    return feed.steps?.filter((step) => step.type === "point").length ?? 0
  }

  const handlePowerManualModeToggle = (feedId: string, enabled: boolean) => {
    const feed = powerFeeds.find((f) => f.id === feedId)
    if (!feed) return
    const steps = enabled ? getPowerSteps(feed) : feed.steps
    const assignedCabinetIds = enabled && steps ? getPowerCabinetIdsFromSteps(steps) : feed.assignedCabinetIds
    dispatch({
      type: "UPDATE_POWER_FEED",
      payload: {
        id: feedId,
        updates: { manualMode: enabled, steps, assignedCabinetIds },
      },
    })
    if (enabled) {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "power", feedId } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleClearPowerManualPoints = (feedId: string) => {
    const feed = powerFeeds.find((f) => f.id === feedId)
    if (!feed?.steps || feed.steps.length === 0) return
    const nextSteps = feed.steps.filter((step) => step.type === "cabinet")
    dispatch({
      type: "UPDATE_POWER_FEED",
      payload: {
        id: feedId,
        updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
      },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handlePowerFeedLabelPosition = (id: string, position: "auto" | "top" | "bottom" | "left" | "right") => {
    dispatch({
      type: "UPDATE_POWER_FEED",
      payload: { id, updates: { labelPosition: position === "auto" ? undefined : position } },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handlePowerFeedLoadOverride = (id: string, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      dispatch({ type: "UPDATE_POWER_FEED", payload: { id, updates: { loadOverrideW: undefined } } })
      return
    }
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isFinite(parsed)) return
    dispatch({ type: "UPDATE_POWER_FEED", payload: { id, updates: { loadOverrideW: parsed } } })
  }

  const handleAddPowerFeed = () => {
    const newFeed: PowerFeed = {
      id: `feed-${Date.now()}`,
      label: `220V @20A`,
      breaker: "220V 20A",
      connector: "NAC3FX-W",
      consumptionW: 0,
      assignedCabinetIds: [],
      connectLvBox: false,
    }
    dispatch({ type: "ADD_POWER_FEED", payload: newFeed })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDeletePowerFeed = (id: string) => {
    dispatch({ type: "DELETE_POWER_FEED", payload: id })
    if (routingMode.type === "power" && routingMode.feedId === id) {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleUpdatePowerFeed = (id: string, updates: Partial<PowerFeed>) => {
    dispatch({ type: "UPDATE_POWER_FEED", payload: { id, updates } })
  }

  const handleStartPowerRouting = (feedId: string) => {
    dispatch({ type: "SET_ROUTING_MODE", payload: { type: "power", feedId } })
  }

  const handleClearPowerFeed = (feedId: string) => {
    dispatch({
      type: "UPDATE_POWER_FEED",
      payload: { id: feedId, updates: { assignedCabinetIds: [], steps: [], connectLvBox: false } },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleAutoPower = () => {
    if (layout.cabinets.length === 0) return

    const cabinetsWithBounds = layout.cabinets
      .map((c) => {
        const bounds = getCabinetBounds(c, layout.cabinetTypes)
        if (!bounds) return null
        return { cabinet: c, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2 }
      })
      .filter(Boolean) as { cabinet: (typeof layout.cabinets)[0]; centerX: number; centerY: number }[]

    // Group by columns
    const tolerance = 100
    const columns: (typeof cabinetsWithBounds)[] = []

    cabinetsWithBounds.forEach((item) => {
      const existingCol = columns.find((col) => col.length > 0 && Math.abs(col[0].centerX - item.centerX) < tolerance)
      if (existingCol) {
        existingCol.push(item)
      } else {
        columns.push([item])
      }
    })

    columns.sort((a, b) => a[0].centerX - b[0].centerX)
    // Order each column bottom -> top (higher Y is lower on the canvas)
    columns.forEach((col) => col.sort((a, b) => b.centerY - a.centerY))

    const orderedCabinetIds: string[] = []
    columns.forEach((col, colIndex) => {
      const colCabinets = col.map((item) => item.cabinet.id)
      if (colIndex % 2 === 1) {
        colCabinets.reverse()
      }
      orderedCabinetIds.push(...colCabinets)
    })

    if (orderedCabinetIds.length === 0) return

    const defaultTemplate = powerFeeds[0]
    const createAutoFeed = (index: number): PowerFeed => ({
      id: `feed-${Date.now()}-${index}`,
      label: defaultTemplate?.label || "220V @20A",
      customLabel: defaultTemplate?.customLabel,
      breaker: defaultTemplate?.breaker || "220V 20A",
      connector: defaultTemplate?.connector || "NAC3FX-W",
      consumptionW: 0,
      assignedCabinetIds: [],
      connectLvBox: false,
    })

    const workingFeeds: PowerFeed[] =
      powerFeeds.length > 0 ? powerFeeds.map((feed) => ({ ...feed })) : [createAutoFeed(1)]
    const assignedByFeed: string[][] = workingFeeds.map(() => [])
    const feedLoads = workingFeeds.map(() => 0)
    const feedLookup = new Map(powerFeeds.map((feed) => [feed.id, feed]))

    const cabinetLoadWById = new Map(
      layout.cabinets.map((cabinet) => [
        cabinet.id,
        getPowerFeedLoadW(
          {
            id: "__cabinet-load__",
            label: "",
            connector: "",
            consumptionW: 0,
            assignedCabinetIds: [cabinet.id],
          },
          layout.cabinets,
          layout.cabinetTypes,
        ),
      ]),
    )

    let activeFeedIndex = 0
    orderedCabinetIds.forEach((cabinetId) => {
      const cabinetLoadW = cabinetLoadWById.get(cabinetId) ?? 0

      while (true) {
        if (activeFeedIndex >= workingFeeds.length) {
          const newFeed = createAutoFeed(workingFeeds.length + 1)
          workingFeeds.push(newFeed)
          assignedByFeed.push([])
          feedLoads.push(0)
        }

        const feed = workingFeeds[activeFeedIndex]
        const maxW = getBreakerMaxW(feed.breaker)
        const maxLoadW = maxW ?? Number.POSITIVE_INFINITY
        const nextLoadW = feedLoads[activeFeedIndex] + cabinetLoadW
        const isEmptyFeed = assignedByFeed[activeFeedIndex].length === 0

        if (nextLoadW <= maxLoadW || isEmptyFeed) {
          assignedByFeed[activeFeedIndex].push(cabinetId)
          feedLoads[activeFeedIndex] = nextLoadW
          break
        }

        activeFeedIndex += 1
      }
    })

    for (let index = powerFeeds.length; index < workingFeeds.length; index++) {
      dispatch({ type: "ADD_POWER_FEED", payload: workingFeeds[index] })
    }

    workingFeeds.forEach((feed, index) => {
      const assignedCabinetIds = assignedByFeed[index] ?? []
      const existingFeed = feedLookup.get(feed.id)
      const isManual = existingFeed?.manualMode ?? feed.manualMode ?? false
      const existingSteps = existingFeed?.steps ?? feed.steps

      dispatch({
        type: "UPDATE_POWER_FEED",
        payload: {
          id: feed.id,
          updates: {
            assignedCabinetIds,
            connectLvBox: false,
            steps: isManual
              ? assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
              : existingSteps,
          },
        },
      })
    })

    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleResetDataRoutes = () => {
    if (dataRoutes.length === 0) return
    dataRoutes.forEach((route) => {
      dispatch({ type: "DELETE_DATA_ROUTE", payload: route.id })
    })
    if (routingMode.type === "data") {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleResetPowerFeeds = () => {
    if (powerFeeds.length === 0) return
    powerFeeds.forEach((feed) => {
      dispatch({ type: "DELETE_POWER_FEED", payload: feed.id })
    })
    if (routingMode.type === "power") {
      dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
    }
    dispatch({ type: "PUSH_HISTORY" })
  }

  return (
    <div className="space-y-4">
        {routingMode.type !== "none" && (
          <div className={routingBannerClass}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-[0.2em] ${routingTitleClass}`}>Routing Mode</div>
                <div className="text-xs text-zinc-400">Press ESC or Done when finished.</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleStopRouting}
                className={routingDoneClass}
              >
                Done
              </Button>
            </div>
          </div>
        )}
        {/* Data Routes Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <Cable className="w-3 h-3 text-blue-500" />
              Data Routes
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetDataRoutes}
                disabled={dataRoutes.length === 0}
                title="Reset all data routes"
                className="h-7 px-2 text-xs text-zinc-300 hover:text-zinc-100"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoRoute}
                title="Auto-route cabinets"
                className="h-7 px-2 text-xs text-blue-100 hover:text-blue-50"
              >
                <Wand2 className="w-3 h-3 mr-1" />
                Auto
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddRoute}
                disabled={dataRoutes.length >= maxPorts}
                className="h-7 px-2"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            {controller}: {maxPorts} ports. Use Route to build a chain, or Auto for a quick snake pass.
          </p>
          <p className="text-xs text-zinc-500">
            Total load: {totalPixelLoad.toLocaleString()} px / {controllerLimits.totalMaxPx.toLocaleString()} px
          </p>
          {controllerLimits.maxWidthPx && controllerLimits.maxHeightPx && (
            <p
              className={`text-xs ${
                layoutWidthPx > controllerLimits.maxWidthPx || layoutHeightPx > controllerLimits.maxHeightPx
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              Max dims: {controllerLimits.maxWidthPx} x {controllerLimits.maxHeightPx} px
            </p>
          )}
          {invalidPorts && (
            <div className="flex items-center justify-between rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300">
              <span>
                {controller} supports {maxPorts} ports. Remove extra routes
                {portUpgradeTarget && portUpgradeTarget !== controller ? ` or switch to ${portUpgradeTarget}.` : "."}
              </span>
              {portUpgradeTarget && portUpgradeTarget !== controller && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dispatch({ type: "UPDATE_PROJECT", payload: { controller: portUpgradeTarget } })}
                  className="h-6 px-2 text-xs bg-red-400 text-zinc-950 hover:bg-red-300"
                >
                  Switch
                </Button>
              )}
            </div>
          )}
          {isOverCurrent && (
            <div className="flex items-center justify-between rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300">
              <span>
                {controller} limit exceeded.
                {capacityUpgradeTarget ? ` Switch to ${capacityUpgradeTarget}.` : " Reduce resolution or split the layout."}
              </span>
              {capacityUpgradeTarget && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => dispatch({ type: "UPDATE_PROJECT", payload: { controller: capacityUpgradeTarget } })}
                  className="h-6 px-2 text-xs bg-red-400 text-zinc-950 hover:bg-red-300"
                >
                  Switch
                </Button>
              )}
            </div>
          )}

          {dataRoutes.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No data routes. Click "Auto" or "+" to add.</p>
          ) : (
            <div className="space-y-2">
              {dataRoutes.map((route) => {
                const isActiveRoute = routingMode.type === "data" && routingMode.routeId === route.id
                return (
                  <div
                    key={route.id}
                    className={`rounded-xl border p-3 space-y-2 ${
                      isActiveRoute
                        ? "border-blue-400/50 bg-gradient-to-r from-blue-500/15 via-zinc-900/80 to-zinc-900"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-500/90 text-zinc-950 text-xs font-bold flex items-center justify-center">
                          P{route.port}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">Data Route</div>
                          <div className="text-xs text-zinc-500">Port {route.port}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {route.cabinetIds.length} cards
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {isActiveRoute ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStopRouting}
                            className="h-7 px-3 text-xs bg-blue-500 hover:bg-blue-400 text-zinc-950"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Done
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartRouting(route.id)}
                            className="h-7 px-3 text-xs text-blue-100 hover:text-blue-50"
                            title="Click to manually route cabinets"
                          >
                            <MousePointer className="w-3 h-3 mr-1" />
                            Route
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClearRoute(route.id)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                          title="Clear route"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRoute(route.id)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {route.cabinetIds.length > 0 ? (
                        <span className="font-mono text-zinc-200">
                          {route.cabinetIds.map(formatRouteEndpointLabel).join(" -> ")}
                        </span>
                      ) : (
                        <span className="italic">No cards - click "Route" to add</span>
                      )}
                    </div>
                    <div
                      className={`text-xs ${
                        isDataRouteOverCapacity(route, layout.cabinets, layout.cabinetTypes, pitchMm)
                          ? "text-red-400"
                          : "text-zinc-400"
                      }`}
                    >
                      Load: {getDataRouteLoadPx(route, layout.cabinets, layout.cabinetTypes, pitchMm).toLocaleString()} px
                      {" / "}
                      650,000 px
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Label Position</Label>
                      <Select
                        value={route.labelPosition ?? (route.forcePortLabelBottom ? "bottom" : "auto")}
                        onValueChange={(value: "auto" | "top" | "bottom" | "left" | "right") =>
                          handleRouteLabelPosition(route.id, value)
                        }
                      >
                        <SelectTrigger className="h-7 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="bottom">Bottom</SelectItem>
                          <SelectItem value="top">Top</SelectItem>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-zinc-400">Manual Points</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500">{getManualPointCount(route)} pts</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManualModeToggle(route.id, !route.manualMode)}
                          className="h-6 px-2 text-[11px] text-blue-200 hover:text-blue-50"
                        >
                          {route.manualMode ? "Points mode on" : "Points mode off"}
                        </Button>
                      </div>
                    </div>
                    {route.manualMode && (
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Click empty space to add points, click cabinets to add/remove, Shift-click point to remove.</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClearManualPoints(route.id)}
                            className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
                          >
                            Clear points
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator className="bg-zinc-700" />

        {/* Power Feeds Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <Zap className="w-3 h-3 text-orange-500" />
              Power Feeds
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetPowerFeeds}
                disabled={powerFeeds.length === 0}
                title="Reset all power feeds"
                className="h-7 px-2 text-xs text-zinc-300 hover:text-zinc-100"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoPower}
                title="Auto-assign cabinets"
                className="h-7 px-2 text-xs text-orange-100 hover:text-orange-50"
              >
                <Wand2 className="w-3 h-3 mr-1" />
                Auto
              </Button>
              <Button variant="ghost" size="sm" onClick={handleAddPowerFeed} className="h-7 px-2">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {powerFeeds.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No power feeds. Click Auto or + to add.</p>
          ) : (
            <div className="space-y-3">
              {powerFeeds.map((feed, index) => {
                const isActiveFeed = routingMode.type === "power" && routingMode.feedId === feed.id
                return (
                  <div
                    key={feed.id}
                    className={`rounded-xl border p-3 space-y-2 ${
                      isActiveFeed
                        ? "border-orange-400/50 bg-gradient-to-r from-orange-500/15 via-zinc-900/80 to-zinc-900"
                        : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-orange-500/90 text-zinc-950 text-xs font-bold flex items-center justify-center">
                          F{index + 1}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">Power Feed</div>
                          <div className="text-xs text-zinc-500">Feed {index + 1}</div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {feed.assignedCabinetIds.length} cabs
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {isActiveFeed ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStopRouting}
                            className="h-7 px-3 text-xs bg-orange-500 hover:bg-orange-400 text-zinc-950"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Done
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartPowerRouting(feed.id)}
                            className="h-7 px-3 text-xs text-orange-100 hover:text-orange-50"
                            title="Click to assign cabinets"
                          >
                            <MousePointer className="w-3 h-3 mr-1" />
                            Assign
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClearPowerFeed(feed.id)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                          title="Clear assignments"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePowerFeed(feed.id)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>{getPowerPointCount(feed)} pts</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePowerManualModeToggle(feed.id, !feed.manualMode)}
                        className="h-6 px-2 text-[11px] text-orange-200 hover:text-orange-50"
                      >
                        {feed.manualMode ? "Points mode on" : "Points mode off"}
                      </Button>
                    </div>
                    {feed.manualMode && (
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>Click empty space to add points, click cabinets to add/remove, Shift-click point to remove.</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClearPowerManualPoints(feed.id)}
                          className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
                        >
                          Clear points
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">Label</Label>
                        <Input
                          value={feed.label}
                          onChange={(e) => handleUpdatePowerFeed(feed.id, { label: e.target.value })}
                          onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                          className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100"
                          placeholder="220V @20A"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">Breaker</Label>
                        <Select
                          value={feed.breaker || "220V 20A"}
                          onValueChange={(value) => handleUpdatePowerFeed(feed.id, { breaker: value })}
                        >
                          <SelectTrigger className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="220V 20A">220V 20A</SelectItem>
                            <SelectItem value="110V 15A">110V 15A</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">Connector</Label>
                        <Input
                          value={feed.connector}
                          onChange={(e) => handleUpdatePowerFeed(feed.id, { connector: e.target.value })}
                          onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                          className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100"
                          placeholder="NAC3FX-W"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">Custom label</Label>
                        <Input
                          value={feed.customLabel ?? ""}
                          onChange={(e) =>
                            handleUpdatePowerFeed(feed.id, {
                              customLabel: e.target.value.length > 0 ? e.target.value : undefined,
                            })
                          }
                          onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                          className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100"
                          placeholder="Optional (under breaker)"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-zinc-400">Label Position</Label>
                        <Select
                          value={feed.labelPosition ?? "auto"}
                          onValueChange={(value: "auto" | "top" | "bottom" | "left" | "right") =>
                            handlePowerFeedLabelPosition(feed.id, value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="bottom">Bottom</SelectItem>
                            <SelectItem value="top">Top</SelectItem>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-zinc-400">Load override (W)</Label>
                        <Input
                          value={Number.isFinite(feed.loadOverrideW) ? `${feed.loadOverrideW}` : ""}
                          onChange={(e) => handlePowerFeedLoadOverride(feed.id, e.target.value)}
                          onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                          className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100"
                          placeholder={`auto`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Load (auto)</Label>
                      <div className="h-8 px-3 rounded-md bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-100 flex items-center">
                        {(() => {
                          const autoLoadW = getPowerFeedLoadW(
                            { ...feed, loadOverrideW: undefined },
                            layout.cabinets,
                            layout.cabinetTypes,
                          )
                          return `${autoLoadW} W`
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Total Consumption */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-orange-400 font-medium">Total Consumption:</span>
                  <span className="font-mono font-bold text-orange-400">
                    {powerFeeds.reduce(
                      (sum, f) => sum + getPowerFeedLoadW(f, layout.cabinets, layout.cabinetTypes),
                      0,
                    )}{" "}
                    W
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

