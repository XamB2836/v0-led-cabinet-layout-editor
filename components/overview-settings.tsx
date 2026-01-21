"use client"

import { useEditor } from "@/lib/editor-context"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Cpu, Tag, Ruler, Cable, Zap, LayoutGrid } from "lucide-react"

export function OverviewSettings() {
  const { state, dispatch } = useEditor()
  const { layout } = state
  const { overview } = layout.project

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

        <div className="space-y-1.5">
          <Label htmlFor="receiver-model" className="text-xs">
            Model
          </Label>
          <Input
            id="receiver-model"
            value={overview?.receiverCardModel || "5A75-E"}
            onChange={(e) => dispatch({ type: "UPDATE_OVERVIEW", payload: { receiverCardModel: e.target.value } })}
            placeholder="5A75-E"
            className="h-8 bg-input text-sm font-mono"
          />
        </div>
      </div>

      <Separator />

      {/* Labels Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Tag className="w-3 h-3" />
          Cabinet Labels
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Label Mode</Label>
          <Select
            value={overview?.labelsMode || "grid"}
            onValueChange={(value: "internal" | "grid") =>
              dispatch({ type: "UPDATE_OVERVIEW", payload: { labelsMode: value } })
            }
          >
            <SelectTrigger className="h-8 bg-input text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid Labels (A1, B1, C1...)</SelectItem>
              <SelectItem value="internal">Internal IDs (C01, C02...)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Grid labels show column letters (A-Z) and row numbers (1-9) like SolidWorks
          </p>
        </div>
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
              value={overview?.moduleSize || "320x160"}
              onValueChange={(value: "320x160" | "160x160") =>
                dispatch({ type: "UPDATE_OVERVIEW", payload: { moduleSize: value } })
              }
            >
              <SelectTrigger className="h-8 bg-input text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="320x160">320 x 160 mm</SelectItem>
                <SelectItem value="160x160">160 x 160 mm</SelectItem>
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
              <SelectTrigger className="h-8 bg-input text-sm">
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
          Module grid helps technicians align tile orientation and seams.
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
    </div>
  )
}
