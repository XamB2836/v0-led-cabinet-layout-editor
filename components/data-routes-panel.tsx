"use client"

import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds } from "@/lib/validation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Zap, Cable, Wand2, MousePointer, X } from "lucide-react"
import type { DataRoute, PowerFeed } from "@/lib/types"

export function DataRoutesPanel() {
  const { state, dispatch } = useEditor()
  const { layout, routingMode } = state
  const { dataRoutes, powerFeeds, controller } = layout.project

  const maxPorts = controller === "A100" ? 2 : 4
  const routingBannerClass =
    routingMode.type === "data"
      ? "rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-500/10 via-zinc-900/80 to-zinc-900 p-3"
      : "rounded-xl border border-orange-400/30 bg-gradient-to-r from-orange-500/10 via-zinc-900/80 to-zinc-900 p-3"
  const routingTitleClass = routingMode.type === "data" ? "text-blue-300/80" : "text-orange-300/80"
  const routingDoneClass =
    routingMode.type === "data"
      ? "h-7 px-3 bg-blue-500/80 text-zinc-950 hover:bg-blue-400"
      : "h-7 px-3 bg-orange-500/80 text-zinc-950 hover:bg-orange-400"

  const handleAutoRoute = () => {
    if (layout.cabinets.length === 0) return

    // Get cabinet positions and group by columns
    const cabinetsWithBounds = layout.cabinets
      .map((c) => {
        const bounds = getCabinetBounds(c, layout.cabinetTypes)
        if (!bounds) return null
        return { cabinet: c, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2, bounds }
      })
      .filter(Boolean) as {
      cabinet: (typeof layout.cabinets)[0]
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

    // Since we're using Y-up coords internally, higher Y = top, so sort descending
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
        const colCabinets = columns[c].map((item) => item.cabinet.id)
        if ((c - startCol) % 2 === 1) {
          colCabinets.reverse()
        }
        cabinetIds.push(...colCabinets)
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

  const handleAddPowerFeed = () => {
    const newFeed: PowerFeed = {
      id: `feed-${Date.now()}`,
      label: `220V @20A`,
      connector: "NAC3FX-W",
      consumptionW: 0,
      assignedCabinetIds: [],
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
    dispatch({ type: "UPDATE_POWER_FEED", payload: { id: feedId, updates: { assignedCabinetIds: [] } } })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleAutoPower = () => {
    if (layout.cabinets.length === 0 || powerFeeds.length === 0) return

    const cabinetsWithBounds = layout.cabinets
      .map((c) => {
        const bounds = getCabinetBounds(c, layout.cabinetTypes)
        if (!bounds) return null
        return { cabinet: c, centerX: bounds.x + bounds.width / 2 }
      })
      .filter(Boolean) as { cabinet: (typeof layout.cabinets)[0]; centerX: number }[]

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

    // Distribute columns across power feeds
    const colsPerFeed = Math.ceil(columns.length / powerFeeds.length)

    powerFeeds.forEach((feed, feedIndex) => {
      const startCol = feedIndex * colsPerFeed
      const endCol = Math.min(startCol + colsPerFeed, columns.length)
      const cabinetIds: string[] = []

      for (let c = startCol; c < endCol; c++) {
        cabinetIds.push(...columns[c].map((item) => item.cabinet.id))
      }

      dispatch({
        type: "UPDATE_POWER_FEED",
        payload: { id: feed.id, updates: { assignedCabinetIds: cabinetIds } },
      })
    })

    dispatch({ type: "PUSH_HISTORY" })
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-4">
        {routingMode.type !== "none" && (
          <div className={routingBannerClass}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-[0.2em] ${routingTitleClass}`}>Routing Mode</div>
                <div className="text-sm text-zinc-100">
                  {routingMode.type === "data"
                    ? `Click cabinets to build Port ${layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)?.port || "?"}`
                    : "Click cabinets to assign to this power feed"}
                </div>
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
                          {route.cabinetIds.length} cabs
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
                        <span className="font-mono text-zinc-200">{route.cabinetIds.join(" -> ")}</span>
                      ) : (
                        <span className="italic">No cabinets - click "Route" to add</span>
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
                onClick={handleAutoPower}
                disabled={powerFeeds.length === 0}
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
            <p className="text-xs text-zinc-500 italic">No power feeds. Click + to add.</p>
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
                        <Label className="text-xs text-zinc-400">Connector</Label>
                        <Input
                          value={feed.connector}
                          onChange={(e) => handleUpdatePowerFeed(feed.id, { connector: e.target.value })}
                          onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                          className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100"
                          placeholder="NAC3FX-W"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">Consumption (W)</Label>
                      <Input
                        type="number"
                        value={feed.consumptionW || ""}
                        onChange={(e) =>
                          handleUpdatePowerFeed(feed.id, { consumptionW: Number.parseInt(e.target.value) || 0 })
                        }
                        onBlur={() => dispatch({ type: "PUSH_HISTORY" })}
                        className="h-8 text-xs bg-zinc-950/60 border-zinc-800 text-zinc-100 font-mono"
                        placeholder="0"
                      />
                    </div>
                  </div>
                )
              })}

              {/* Total Consumption */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-orange-400 font-medium">Total Consumption:</span>
                  <span className="font-mono font-bold text-orange-400">
                    {powerFeeds.reduce((sum, f) => sum + (f.consumptionW || 0), 0)} W
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}

