"use client"

import { useEditor } from "@/lib/editor-context"
import { validateLayout, getLayoutBounds } from "@/lib/validation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, AlertTriangle, RotateCw, Trash2, Copy, CheckCircle, Settings, Sliders, Cable } from "lucide-react"
import { OverviewSettings } from "./overview-settings"
import { DataRoutesPanel } from "./data-routes-panel"

export function PropertiesPanel() {
  const { state, dispatch } = useEditor()
  const { layout, selectedCabinetId } = state

  const selectedCabinet = layout.cabinets.find((c) => c.id === selectedCabinetId)
  const errors = validateLayout(layout)
  const bounds = getLayoutBounds(layout)

  const pitch = layout.project.pitch_mm
  const widthPx = bounds.width > 0 ? Math.round(bounds.width / pitch) : 0
  const heightPx = bounds.height > 0 ? Math.round(bounds.height / pitch) : 0

  const handleRotate = () => {
    if (!selectedCabinet) return
    const newRot = ((selectedCabinet.rot_deg + 90) % 360) as 0 | 90 | 180 | 270
    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates: { rot_deg: newRot } },
    })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDelete = () => {
    if (!selectedCabinet) return
    dispatch({ type: "DELETE_CABINET", payload: selectedCabinet.id })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDuplicate = () => {
    if (!selectedCabinet) return
    dispatch({ type: "DUPLICATE_CABINET", payload: selectedCabinet.id })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleUpdateField = (field: string, value: string | number | null) => {
    if (!selectedCabinet) return
    dispatch({
      type: "UPDATE_CABINET",
      payload: { id: selectedCabinet.id, updates: { [field]: value } },
    })
  }

  const handleBlur = () => {
    dispatch({ type: "PUSH_HISTORY" })
  }

  const errorCount = errors.filter((e) => e.type === "error").length
  const warningCount = errors.filter((e) => e.type === "warning").length

  return (
    <div className="w-80 bg-sidebar border-l border-sidebar-border flex flex-col">
      <Tabs defaultValue="properties" className="flex-1 flex flex-col">
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

        <TabsContent value="properties" className="flex-1 flex flex-col mt-0 data-[state=inactive]:hidden">
          {/* Properties Section */}
          <div className="p-3 border-b border-sidebar-border">
            <h2 className="text-sm font-semibold text-sidebar-foreground mb-3">Cabinet Properties</h2>

            {selectedCabinet ? (
              <div className="space-y-3">
                {/* ID */}
                <div className="space-y-1">
                  <Label htmlFor="cabinet-id" className="text-xs">
                    Cabinet ID
                  </Label>
                  <Input
                    id="cabinet-id"
                    value={selectedCabinet.id}
                    onChange={(e) => handleUpdateField("id", e.target.value)}
                    onBlur={handleBlur}
                    className="h-8 bg-input text-sm font-mono"
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={selectedCabinet.typeId}
                    onValueChange={(value) => {
                      handleUpdateField("typeId", value)
                      dispatch({ type: "PUSH_HISTORY" })
                    }}
                  >
                    <SelectTrigger className="h-8 bg-input text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {layout.cabinetTypes.map((type) => (
                        <SelectItem key={type.typeId} value={type.typeId}>
                          {type.typeId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="x-pos" className="text-xs">
                      X (mm)
                    </Label>
                    <Input
                      id="x-pos"
                      type="number"
                      value={selectedCabinet.x_mm}
                      onChange={(e) => handleUpdateField("x_mm", Number.parseInt(e.target.value) || 0)}
                      onBlur={handleBlur}
                      className="h-8 bg-input text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="y-pos" className="text-xs">
                      Y (mm)
                    </Label>
                    <Input
                      id="y-pos"
                      type="number"
                      value={selectedCabinet.y_mm}
                      onChange={(e) => handleUpdateField("y_mm", Number.parseInt(e.target.value) || 0)}
                      onBlur={handleBlur}
                      className="h-8 bg-input text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Rotation */}
                <div className="space-y-1">
                  <Label className="text-xs">Rotation</Label>
                  <Select
                    value={String(selectedCabinet.rot_deg)}
                    onValueChange={(value) => {
                      handleUpdateField("rot_deg", Number.parseInt(value) as 0 | 90 | 180 | 270)
                      dispatch({ type: "PUSH_HISTORY" })
                    }}
                  >
                    <SelectTrigger className="h-8 bg-input text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0°</SelectItem>
                      <SelectItem value="90">90°</SelectItem>
                      <SelectItem value="180">180°</SelectItem>
                      <SelectItem value="270">270°</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Port & Chain (optional) */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="port" className="text-xs">
                      Port
                    </Label>
                    <Input
                      id="port"
                      type="number"
                      min={1}
                      max={4}
                      value={selectedCabinet.port || ""}
                      placeholder="-"
                      onChange={(e) => handleUpdateField("port", Number.parseInt(e.target.value) || undefined)}
                      onBlur={handleBlur}
                      className="h-8 bg-input text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="chain" className="text-xs">
                      Chain Index
                    </Label>
                    <Input
                      id="chain"
                      type="number"
                      min={1}
                      value={selectedCabinet.chainIndex || ""}
                      placeholder="-"
                      onChange={(e) => handleUpdateField("chainIndex", Number.parseInt(e.target.value) || undefined)}
                      onBlur={handleBlur}
                      className="h-8 bg-input text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Receiver Card</Label>
                  <Select
                    value={
                      selectedCabinet.receiverCardOverride === null
                        ? "none"
                        : selectedCabinet.receiverCardOverride === undefined
                          ? "default"
                          : "custom"
                    }
                    onValueChange={(value) => {
                      if (value === "none") {
                        handleUpdateField("receiverCardOverride", null)
                      } else if (value === "default") {
                        handleUpdateField("receiverCardOverride", undefined)
                      }
                      dispatch({ type: "PUSH_HISTORY" })
                    }}
                  >
                    <SelectTrigger className="h-8 bg-input text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        Use Global ({layout.project.overview?.receiverCardModel || "5A75-E"})
                      </SelectItem>
                      <SelectItem value="none">Hide</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedCabinet.receiverCardOverride !== null &&
                    selectedCabinet.receiverCardOverride !== undefined && (
                      <Input
                        value={selectedCabinet.receiverCardOverride}
                        onChange={(e) => handleUpdateField("receiverCardOverride", e.target.value)}
                        onBlur={handleBlur}
                        placeholder="Custom model"
                        className="h-8 bg-input text-sm font-mono mt-1"
                      />
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRotate}
                    className="flex-1 bg-transparent"
                    title="Rotate 90° (R)"
                  >
                    <RotateCw className="w-4 h-4 mr-1" />
                    Rotate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicate}
                    className="flex-1 bg-transparent"
                    title="Duplicate (Ctrl+D)"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete} title="Delete (Del)">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a cabinet to edit its properties</p>
            )}
          </div>

          {/* Layout Info */}
          <div className="p-3 border-b border-sidebar-border">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">Layout Info</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Cabinets:</span>
              <span className="font-mono">{layout.cabinets.length}</span>
              <span className="text-muted-foreground">Width:</span>
              <span className="font-mono">{bounds.width} mm</span>
              <span className="text-muted-foreground">Height:</span>
              <span className="font-mono">{bounds.height} mm</span>
              <span className="text-muted-foreground">Width (px):</span>
              <span className="font-mono">{widthPx} px</span>
              <span className="text-muted-foreground">Height (px):</span>
              <span className="font-mono">{heightPx} px</span>
            </div>
          </div>

          {/* Diagnostics */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-sidebar-foreground">Diagnostics</h2>
              <div className="flex items-center gap-2 text-xs">
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-error">
                    <AlertCircle className="w-3 h-3" />
                    {errorCount}
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-warning">
                    <AlertTriangle className="w-3 h-3" />
                    {warningCount}
                  </span>
                )}
                {errorCount === 0 && warningCount === 0 && (
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle className="w-3 h-3" />
                    OK
                  </span>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {errors.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No issues detected</p>
                ) : (
                  errors.map((error, i) => (
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
                        <span>{error.message}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="routes" className="flex-1 flex flex-col mt-0 data-[state=inactive]:hidden">
          <DataRoutesPanel />
        </TabsContent>

        <TabsContent value="overview" className="flex-1 p-3 mt-0 overflow-auto data-[state=inactive]:hidden">
          <OverviewSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
