"use client"

import { useEffect, useState } from "react"
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

  const receiverCardCount = selectedCabinet ? getCabinetReceiverCardCount(selectedCabinet) : 1
  const receiverModelDefault = layout.project.overview.receiverCardModel || "5A75-E"
  const [receiverModelDraft, setReceiverModelDraft] = useState(receiverModelDefault)
  const [gridLabelDraft, setGridLabelDraft] = useState("")

  useEffect(() => {
    setReceiverModelDraft(receiverModelDefault)
  }, [receiverModelDefault])

  useEffect(() => {
    setGridLabelDraft(selectedCabinet?.gridLabelOverride ?? "")
  }, [selectedCabinet?.id, selectedCabinet?.gridLabelOverride])

  const handleDelete = () => {
    if (!selectedCabinet) return
    dispatch({ type: "DELETE_CABINET", payload: selectedCabinet.id })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleReceiverCardCount = (count: 0 | 1 | 2) => {
    if (!selectedCabinet) return

    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates: { receiverCardCount: count, receiverCardOverride: undefined } },
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

  const handleApplyReceiverModel = () => {
    const nextModel = receiverModelDraft.trim() || "5A75-E"
    let changed = false

    if (nextModel !== layout.project.overview.receiverCardModel) {
      dispatch({ type: "UPDATE_OVERVIEW", payload: { receiverCardModel: nextModel } })
      changed = true
    }

    layout.cabinets.forEach((cabinet) => {
      if (cabinet.receiverCardOverride !== undefined) {
        const updates: Partial<Cabinet> = { receiverCardOverride: undefined }
        if (cabinet.receiverCardOverride === null) {
          updates.receiverCardCount = 0
        }
        dispatch({ type: "UPDATE_CABINET", payload: { id: cabinet.id, updates } })
        changed = true
      }
    })

    if (changed) {
      dispatch({ type: "PUSH_HISTORY" })
    }
  }

  const handleApplyGridLabelOverride = () => {
    if (!selectedCabinet) return
    const trimmed = gridLabelDraft.trim()
    const nextValue = trimmed.length === 0 ? undefined : trimmed
    if ((selectedCabinet.gridLabelOverride ?? "") === (nextValue ?? "")) return
    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates: { gridLabelOverride: nextValue } },
    })
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
                    {labelsMode === "grid" ? (
                      <div className="space-y-2">
                        <Label className="text-xs">Grid Label Override</Label>
                        <Input
                          value={gridLabelDraft}
                          onChange={(e) => setGridLabelDraft(e.target.value)}
                          onBlur={handleApplyGridLabelOverride}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              ;(e.target as HTMLInputElement).blur()
                            }
                          }}
                          className="h-8 bg-input text-sm font-mono"
                          placeholder="Auto"
                        />
                        <div className="text-[11px] text-zinc-500">Leave empty to use auto grid labels.</div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Receiver Cards</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={handleApplyReceiverModel}
                        >
                          Apply to all
                        </Button>
                      </div>
                      <Input
                        value={receiverModelDraft}
                        onChange={(e) => setReceiverModelDraft(e.target.value)}
                        className="h-8 bg-input text-sm font-mono"
                        placeholder="5A75-E"
                      />
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
