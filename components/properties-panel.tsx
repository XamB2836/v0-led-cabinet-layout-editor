"use client"

import { useEditor } from "@/lib/editor-context"
import { getLayoutBounds, validateLayout } from "@/lib/validation"
import type { Cabinet } from "@/lib/types"
import {
  computeGridLabel,
  formatRouteCabinetId,
  getCabinetReceiverCardCount,
  parseRouteCabinetId,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, AlertTriangle, Trash2, CheckCircle, Settings, Sliders, Cable } from "lucide-react"
import { OverviewSettings } from "./overview-settings"
import { DataRoutesPanel } from "./data-routes-panel"

export function PropertiesPanel() {
  const { state, dispatch } = useEditor()
  const { layout, selectedCabinetId } = state

  const selectedCabinet = layout.cabinets.find((c) => c.id === selectedCabinetId)
  const errors = validateLayout(layout)
  const bounds = getLayoutBounds(layout)
  const labelsMode = layout.project.overview.labelsMode

  const pitch = layout.project.pitch_mm
  const widthPx = bounds.width > 0 ? Math.round(bounds.width / pitch) : 0
  const heightPx = bounds.height > 0 ? Math.round(bounds.height / pitch) : 0

  const receiverCardMode =
    selectedCabinet?.receiverCardOverride === null
      ? "none"
      : selectedCabinet?.receiverCardOverride
        ? "custom"
        : "default"
  const receiverCardCount = selectedCabinet ? getCabinetReceiverCardCount(selectedCabinet) : 1

  const handleDelete = () => {
    if (!selectedCabinet) return
    dispatch({ type: "DELETE_CABINET", payload: selectedCabinet.id })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleUpdateField = (field: string, value: string | number | null | undefined) => {
    if (!selectedCabinet) return
    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates: { [field]: value } },
    })
  }

  const handleReceiverCardCount = (count: 0 | 1 | 2) => {
    if (!selectedCabinet) return

    const updates: Partial<Cabinet> = { receiverCardCount: count }
    if (count === 0) {
      updates.receiverCardOverride = null
    } else if (selectedCabinet.receiverCardOverride === null) {
      updates.receiverCardOverride = undefined
    }

    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates },
    })

    const routeUpdates = layout.project.dataRoutes
      .map((route) => {
        let changed = false
        const seen = new Set<string>()
        const newCabinetIds: string[] = []

        route.cabinetIds.forEach((endpointId) => {
          const parsed = parseRouteCabinetId(endpointId)
          if (parsed.cabinetId !== selectedCabinet.id) {
            newCabinetIds.push(endpointId)
            return
          }

          if (count === 0) {
            changed = true
            return
          }

          if (count === 1) {
            const normalized = selectedCabinet.id
            if (!seen.has(normalized)) {
              newCabinetIds.push(normalized)
              seen.add(normalized)
            } else {
              changed = true
            }
            if (endpointId !== normalized) changed = true
            return
          }

          const normalized = formatRouteCabinetId(selectedCabinet.id, parsed.cardIndex ?? 0)
          if (!seen.has(normalized)) {
            newCabinetIds.push(normalized)
            seen.add(normalized)
          } else {
            changed = true
          }
          if (endpointId !== normalized) changed = true
        })

        if (!changed && newCabinetIds.length === route.cabinetIds.length) return null
        if (newCabinetIds.length !== route.cabinetIds.length) changed = true
        if (!changed) return null
        return { id: route.id, cabinetIds: newCabinetIds }
      })
      .filter(Boolean) as { id: string; cabinetIds: string[] }[]

    routeUpdates.forEach((update) => {
      dispatch({ type: "UPDATE_DATA_ROUTE", payload: { id: update.id, updates: { cabinetIds: update.cabinetIds } } })
    })

    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleBlur = () => {
    dispatch({ type: "PUSH_HISTORY" })
  }

  const errorCount = errors.filter((e) => e.type === "error").length
  const warningCount = errors.filter((e) => e.type === "warning").length

  const getCabinetLabel = (cabinetId: string) => {
    if (labelsMode !== "grid") return cabinetId
    const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
    if (!cabinet) return cabinetId
    return computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes)
  }

  const getErrorMessage = (error: (typeof errors)[number]) => {
    const [firstId, secondId] = error.cabinetIds
    const firstLabel = firstId ? getCabinetLabel(firstId) : "?"
    const secondLabel = secondId ? getCabinetLabel(secondId) : "?"

    switch (error.code) {
      case "DUPLICATE_ID":
        return `Duplicate cabinet ID: ${firstLabel}`
      case "MISSING_TYPE": {
        const cabinet = firstId ? layout.cabinets.find((c) => c.id === firstId) : null
        const typeId = cabinet?.typeId || "?"
        return `Cabinet ${firstLabel} has unknown type: ${typeId}`
      }
      case "OVERLAP":
        return `Cabinets ${firstLabel} and ${secondLabel} overlap`
      case "OUT_OF_GRID":
        return `Cabinet ${firstLabel} is not aligned to grid (${layout.project.grid.step_mm}mm)`
      case "ISOLATED_CABINET":
        return `Cabinet ${firstLabel} has no adjacent neighbors`
      default:
        return error.message
    }
  }

  return (
    <div className="w-[21.25rem] bg-sidebar border-l border-sidebar-border flex flex-col min-h-0 overflow-hidden">
      <Tabs defaultValue="properties" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-3 m-2 mb-0">
          <TabsTrigger value="properties" className="text-xs">
            <Settings className="w-3 h-3 mr-1" />
            Props
          </TabsTrigger>
          <TabsTrigger value="routes" className="text-xs">
            <Cable className="w-3 h-3 mr-1" />
            Routes
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">
            <Sliders className="w-3 h-3 mr-1" />
            View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 p-3 pr-14">
              <div className="border border-sidebar-border rounded-md p-3">
                <h2 className="text-sm font-semibold text-sidebar-foreground mb-3">Cabinet Properties</h2>

                {selectedCabinet ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Receiver Card</Label>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Display</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant={receiverCardMode === "default" ? "secondary" : "outline"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            handleUpdateField("receiverCardOverride", undefined)
                            dispatch({ type: "PUSH_HISTORY" })
                          }}
                        >
                          Default
                        </Button>
                        <Button
                          type="button"
                          variant={receiverCardMode === "none" ? "secondary" : "outline"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            handleUpdateField("receiverCardOverride", null)
                            dispatch({ type: "PUSH_HISTORY" })
                          }}
                        >
                          Hidden
                        </Button>
                        <Button
                          type="button"
                          variant={receiverCardMode === "custom" ? "secondary" : "outline"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            handleUpdateField("receiverCardOverride", layout.project.overview.receiverCardModel)
                            dispatch({ type: "PUSH_HISTORY" })
                          }}
                        >
                          Custom
                        </Button>
                      </div>
                      {receiverCardMode === "custom" && (
                        <Input
                          value={selectedCabinet.receiverCardOverride || ""}
                          onChange={(e) => handleUpdateField("receiverCardOverride", e.target.value)}
                          onBlur={handleBlur}
                          className="h-8 bg-input text-sm font-mono"
                          placeholder={layout.project.overview.receiverCardModel}
                        />
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Cards</Label>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Routing</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            type="button"
                            variant={receiverCardCount === 0 ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleReceiverCardCount(0)}
                          >
                            0
                          </Button>
                          <Button
                            type="button"
                            variant={receiverCardCount === 1 ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleReceiverCardCount(1)}
                          >
                            1
                          </Button>
                          <Button
                            type="button"
                            variant={receiverCardCount === 2 ? "secondary" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleReceiverCardCount(2)}
                          >
                            2
                          </Button>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Two cards split routing as A1a/A1b to optimize mapping.
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Preview</span>
                        <span className="rounded bg-white px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-900">
                          {receiverCardMode === "none"
                            ? "Hidden"
                            : receiverCardMode === "custom"
                              ? selectedCabinet.receiverCardOverride || layout.project.overview.receiverCardModel
                              : layout.project.overview.receiverCardModel}
                        </span>
                        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                          {receiverCardCount} card{receiverCardCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <Button variant="destructive" size="sm" onClick={handleDelete} title="Delete cabinet">
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a cabinet to edit its properties</p>
                )}
              </div>

              <div className="border border-sidebar-border rounded-md p-3">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">Layout Info</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Cabinets:</span>
                  <span className="font-mono">{layout.cabinets.length}</span>
                  <span className="text-muted-foreground">Width:</span>
                  <span className="font-mono">
                    {bounds.width} mm ({widthPx} px)
                  </span>
                  <span className="text-muted-foreground">Height:</span>
                  <span className="font-mono">
                    {bounds.height} mm ({heightPx} px)
                  </span>
                </div>
              </div>

              <div className="border border-sidebar-border rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  {errorCount === 0 && warningCount === 0 ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-error" />
                  )}
                  <h3 className="text-xs font-semibold text-muted-foreground">Layout Health</h3>
                </div>

                {errors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No issues detected</p>
                ) : (
                  <div className="space-y-2">
                    {errors.map((error, i) => (
                      <button
                        key={i}
                        className={`w-full text-left p-2 rounded-md text-xs hover:bg-sidebar-accent transition-colors ${
                          error.type === "error" ? "bg-error/10 text-error" : "bg-warning/10 text-warning"
                        }`}
                        onClick={() => {
                          if (error.cabinetIds.length > 0) {
                            dispatch({ type: "SELECT_CABINET", payload: error.cabinetIds[0] })
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {error.type === "error" ? (
                            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          )}
                          <span>{getErrorMessage(error)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="routes" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 pr-14">
              <DataRoutesPanel />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="overview" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 pr-14">
              <OverviewSettings />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
