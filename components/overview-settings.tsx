"use client"

import { useEffect, useState } from "react"
import { useEditor } from "@/lib/editor-context"
import { DEFAULT_LAYOUT, type ModuleSize } from "@/lib/types"
import { coerceModeModuleSize, getModeModuleSizeOptions } from "@/lib/modes"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  DEFAULT_RECEIVER_CARD_MODEL,
  RECEIVER_CARD_MODELS,
  formatReceiverCardOptionLabel,
} from "@/lib/receiver-cards"
import { Cpu, Tag, Ruler, Cable, Zap, LayoutGrid, FileDown, Hash } from "lucide-react"

export function OverviewSettings() {
  const { state, dispatch } = useEditor()
  const { layout } = state
  const { overview, exportSettings } = layout.project
  const mode = layout.project.mode ?? "indoor"
  const mappingDefaults = DEFAULT_LAYOUT.project.overview.mappingNumbers
  const mappingNumbers = overview?.mappingNumbers ?? mappingDefaults
  const showMappingNumbers = mappingNumbers?.show ?? false
  const gridLabelAxis = overview?.gridLabelAxis ?? "columns"
  const numberOfDisplays = Math.max(1, overview?.numberOfDisplays ?? 1)
  const moduleSizeOptions = getModeModuleSizeOptions(mode)
  const selectedModuleSize = coerceModeModuleSize(mode, overview?.moduleSize)
  const isModuleOrientationEnabled = selectedModuleSize !== "320x320"
  const labelSequenceValue = mappingNumbers.labels?.join(", ") ?? ""
  const [labelSequenceDraft, setLabelSequenceDraft] = useState(labelSequenceValue)

  useEffect(() => {
    setLabelSequenceDraft(labelSequenceValue)
  }, [labelSequenceValue])

  const updateMappingNumbers = (updates: Partial<typeof mappingNumbers>) => {
    dispatch({
      type: "UPDATE_OVERVIEW",
      payload: { mappingNumbers: { ...mappingNumbers, ...updates } },
    })
  }

  const handleApplyLabelSequence = () => {
    const tokens = labelSequenceDraft
      .split(/[, ]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    const parsed = tokens
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value))
    updateMappingNumbers({ labels: parsed.length > 0 ? parsed : undefined })
  }

  const handleClearManualAssignments = () => {
    updateMappingNumbers({ manualAssignments: { perChain: {}, perEndpoint: {} } })
  }

  return (
    <div className="space-y-4">
      {/* Receiver Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Cpu className="w-3 h-3" />
          Receiver Cards
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-receivers" className="text-sm">
            Show Receiver Cards
          </Label>
          <Switch
            id="show-receivers"
            checked={overview?.showReceiverCards ?? true}
            onCheckedChange={(checked) =>
              dispatch({ type: "UPDATE_OVERVIEW", payload: { showReceiverCards: checked } })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="receiver-model" className="text-xs">
              Model
            </Label>
            <Input
              id="receiver-model"
              value={overview?.receiverCardModel || DEFAULT_RECEIVER_CARD_MODEL}
              onChange={(e) => dispatch({ type: "UPDATE_OVERVIEW", payload: { receiverCardModel: e.target.value } })}
              placeholder={DEFAULT_RECEIVER_CARD_MODEL}
              className="h-8 bg-input text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Preset</Label>
            <Select
              onValueChange={(value) =>
                dispatch({ type: "UPDATE_OVERVIEW", payload: { receiverCardModel: value } })
              }
            >
              <SelectTrigger className="h-8 bg-input text-sm">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {RECEIVER_CARD_MODELS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {formatReceiverCardOptionLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Labels Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Tag className="w-3 h-3" />
          Cabinet Labels
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-cabinet-labels" className="text-sm">
            Show Cabinet Labels
          </Label>
          <Switch
            id="show-cabinet-labels"
            checked={overview?.showCabinetLabels ?? true}
            onCheckedChange={(checked) => dispatch({ type: "UPDATE_OVERVIEW", payload: { showCabinetLabels: checked } })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Label axis</Label>
          <Select
            value={gridLabelAxis}
            onValueChange={(value: "columns" | "rows") =>
              dispatch({ type: "UPDATE_OVERVIEW", payload: { gridLabelAxis: value } })
            }
          >
            <SelectTrigger className="h-8 bg-input text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="columns">Columns -&gt; Letters (A1, B1)</SelectItem>
              <SelectItem value="rows">Rows -&gt; Letters (A1, A2)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Toggle the cabinet grid labels on the layout.</p>
      </div>

      <Separator />

      {/* Module Grid Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <LayoutGrid className="w-3 h-3" />
          LED Modules
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-module-grid" className="text-sm">
            Show Module Grid
          </Label>
          <Switch
            id="show-module-grid"
            checked={overview?.showModuleGrid ?? true}
            onCheckedChange={(checked) =>
              dispatch({ type: "UPDATE_OVERVIEW", payload: { showModuleGrid: checked } })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Module Size</Label>
            <Select
              value={selectedModuleSize}
              onValueChange={(value: ModuleSize) =>
                dispatch({ type: "UPDATE_OVERVIEW", payload: { moduleSize: value } })
              }
            >
              <SelectTrigger className="h-8 bg-input text-sm" disabled={moduleSizeOptions.length === 1}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moduleSizeOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace("x", " x ")} mm
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Orientation</Label>
            <Select
              value={overview?.moduleOrientation || "portrait"}
              onValueChange={(value: "landscape" | "portrait") =>
                dispatch({ type: "UPDATE_OVERVIEW", payload: { moduleOrientation: value } })
              }
            >
              <SelectTrigger className="h-8 bg-input text-sm" disabled={!isModuleOrientationEnabled}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">Landscape</SelectItem>
                <SelectItem value="portrait">Portrait</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "outdoor"
            ? "Outdoor uses 320 x 320 modules."
            : "Module grid helps technicians align tile orientation and seams."}
        </p>
      </div>

      <Separator />

      {/* Dimensions Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Ruler className="w-3 h-3" />
          Dimensions
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-pixels" className="text-sm">
            Show Pixel Dimensions
          </Label>
          <Switch
            id="show-pixels"
            checked={overview?.showPixels ?? true}
            onCheckedChange={(checked) => dispatch({ type: "UPDATE_OVERVIEW", payload: { showPixels: checked } })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Display dimensions in both mm and pixels (based on pitch)</p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Cable className="w-3 h-3 text-blue-500" />
          Data Routes
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-data-routes" className="text-sm">
            Show Data Routes
          </Label>
          <Switch
            id="show-data-routes"
            checked={overview?.showDataRoutes ?? true}
            onCheckedChange={(checked) => dispatch({ type: "UPDATE_OVERVIEW", payload: { showDataRoutes: checked } })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="force-port-labels-bottom" className="text-sm">
            Default Port Labels Bottom
          </Label>
          <Switch
            id="force-port-labels-bottom"
            checked={overview?.forcePortLabelsBottom ?? false}
            onCheckedChange={(checked) =>
              dispatch({ type: "UPDATE_OVERVIEW", payload: { forcePortLabelsBottom: checked } })
            }
          />
        </div>
        <p className="text-xs text-muted-foreground">Display blue data chain lines between cabinets</p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Hash className="w-3 h-3 text-sky-400" />
          Mapping Numbers
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-mapping-numbers" className="text-sm">
            Show mapping numbers
          </Label>
          <Switch
            id="show-mapping-numbers"
            checked={showMappingNumbers}
            onCheckedChange={(checked) => updateMappingNumbers({ show: checked })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Labels represent the HUB output group index feeding each module chain (odd numbers by default).
        </p>

        {showMappingNumbers && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mappingNumbers.mode === "auto" ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => updateMappingNumbers({ mode: "auto" })}
                >
                  Auto
                </Button>
                <Button
                  type="button"
                  variant={mappingNumbers.mode === "manual" ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => updateMappingNumbers({ mode: "manual" })}
                >
                  Manual
                </Button>
              </div>
            </div>

            {mappingNumbers.mode === "auto" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Restart per receiver card</Label>
                  <Switch
                    checked={mappingNumbers.restartPerCard ?? true}
                    onCheckedChange={(checked) => updateMappingNumbers({ restartPerCard: checked })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Label sequence</Label>
                  <Input
                    value={labelSequenceDraft}
                    onChange={(e) => setLabelSequenceDraft(e.target.value)}
                    onBlur={handleApplyLabelSequence}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                    className="h-8 bg-input text-sm font-mono"
                    placeholder="1, 3, 5, 7, 9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated labels. If you run out, odd numbers continue (17, 19, 21...).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Manual value</Label>
                  <Input
                    value={mappingNumbers.manualValue ?? ""}
                    onChange={(e) => updateMappingNumbers({ manualValue: e.target.value })}
                    className="h-8 bg-input text-sm font-mono"
                    placeholder="e.g. 1"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Apply to chain</Label>
                  <Switch
                    checked={mappingNumbers.applyToChain ?? true}
                    onCheckedChange={(checked) => updateMappingNumbers({ applyToChain: checked })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Click a cabinet (or card) on the canvas to assign the value.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleClearManualAssignments}
                >
                  Clear manual assignments
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Font size</Label>
                <Select
                  value={mappingNumbers.fontSize ?? "medium"}
                  onValueChange={(value: "small" | "medium" | "large") => updateMappingNumbers({ fontSize: value })}
                >
                  <SelectTrigger className="h-8 bg-input text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Position</Label>
                <Select
                  value={mappingNumbers.position ?? "top-right"}
                  onValueChange={(value: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom") =>
                    updateMappingNumbers({ position: value })
                  }
                >
                  <SelectTrigger className="h-8 bg-input text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-left">Top-left</SelectItem>
                    <SelectItem value="top-right">Top-right</SelectItem>
                    <SelectItem value="bottom-left">Bottom-left</SelectItem>
                    <SelectItem value="bottom-right">Bottom-right</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Background badge</Label>
              <Switch
                checked={mappingNumbers.badge ?? true}
                onCheckedChange={(checked) => updateMappingNumbers({ badge: checked })}
              />
            </div>
            {mappingNumbers.position === "custom" && (
              <p className="text-[11px] text-muted-foreground">
                Drag the label in the canvas to place it.
              </p>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Zap className="w-3 h-3 text-orange-500" />
          Power Routes
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-power-routes" className="text-sm">
            Show Power Feeds
          </Label>
          <Switch
            id="show-power-routes"
            checked={overview?.showPowerRoutes ?? true}
            onCheckedChange={(checked) => dispatch({ type: "UPDATE_OVERVIEW", payload: { showPowerRoutes: checked } })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Display orange power feed lines and consumption labels</p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <FileDown className="w-3 h-3" />
          PDF Export
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="overview-custom-title" className="text-xs">
            Custom Overview Title
          </Label>
          <Input
            id="overview-custom-title"
            value={exportSettings?.title || ""}
            onChange={(e) => dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { title: e.target.value } })}
            placeholder="Leave empty to use auto title"
            className="h-8 bg-input text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">View</Label>
          <Select
            value={exportSettings?.viewSide || "front"}
            onValueChange={(value: "front" | "back") =>
              dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { viewSide: value } })
            }
          >
            <SelectTrigger className="h-8 bg-input text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="front">Front View</SelectItem>
              <SelectItem value="back">Back View</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Printed on the PDF header.</p>
        <div className="space-y-1.5">
          <Label htmlFor="number-of-displays" className="text-xs">
            Number of Displays
          </Label>
          <Input
            id="number-of-displays"
            type="number"
            min={1}
            step={1}
            value={numberOfDisplays}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10)
              if (!Number.isFinite(parsed)) return
              dispatch({ type: "UPDATE_OVERVIEW", payload: { numberOfDisplays: Math.max(1, parsed) } })
            }}
            className="h-8 bg-input text-sm"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-legend" className="text-sm">
            Show Legend
          </Label>
          <Switch
            id="show-legend"
            checked={exportSettings?.showLegend ?? true}
            onCheckedChange={(checked) =>
              dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { showLegend: checked } })
            }
          />
        </div>
      </div>
    </div>
  )
}
