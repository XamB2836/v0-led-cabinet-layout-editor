"use client"

import type React from "react"

import { useRef } from "react"
import { useEditor } from "@/lib/editor-context"
import type { LayoutData } from "@/lib/types"
import { exportOverviewPdf } from "@/lib/export-pdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Upload, Undo2, Redo2, Grid3X3, FileDown, Trash2 } from "lucide-react"

export function TopBar() {
  const { state, dispatch, resetEditor } = useEditor()
  const { layout } = state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pitchOptions = [1.25, 1.56, 1.86, 2.5, 4, 5]
  const pitchValue = pitchOptions.includes(layout.project.pitch_mm) ? layout.project.pitch_mm : 2.5
  const pitchMode = layout.project.pitch_is_gob ? "gob" : "std"
  const projectNumber = layout.project.name.replace(/\D/g, "")

  const handleExportJSON = () => {
    const json = JSON.stringify(layout, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${layout.project.name.replace(/\s+/g, "_")}_layout.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as LayoutData
        if (imported.schemaVersion && imported.project && imported.cabinets) {
          dispatch({ type: "SET_LAYOUT", payload: imported })
        } else {
          alert("Invalid layout file format")
        }
      } catch {
        alert("Failed to parse JSON file")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleUndo = () => dispatch({ type: "UNDO" })
  const handleRedo = () => dispatch({ type: "REDO" })
  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1
  const handleReset = () => {
    if (!window.confirm("Reset the layout? This clears the autosaved cache.")) return
    resetEditor()
  }
  return (
    <div className="h-14 bg-card border-b border-border px-4 flex items-center gap-6">
      {/* Project Name */}
      <div className="flex items-center gap-2">
        <Label htmlFor="project-name" className="text-xs text-muted-foreground">
          NC
        </Label>
        <Input
          id="project-name"
          inputMode="numeric"
          value={projectNumber}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "")
            dispatch({ type: "UPDATE_PROJECT", payload: { name: digits ? `NC${digits}` : "NC" } })
          }}
          className="h-8 w-24 bg-secondary text-sm"
        />
      </div>

      {/* Client */}
      <div className="flex items-center gap-2">
        <Label htmlFor="client-name" className="text-xs text-muted-foreground">
          Client
        </Label>
        <Input
          id="client-name"
          value={layout.project.client || ""}
          onChange={(e) => dispatch({ type: "UPDATE_PROJECT", payload: { client: e.target.value } })}
          className="h-8 w-32 bg-secondary text-sm"
        />
      </div>

      {/* Pitch */}
      <div className="flex items-center gap-2">
        <Label htmlFor="pitch" className="text-xs text-muted-foreground">
          Pitch
        </Label>
        <Select
          value={`${pitchValue}|${pitchMode}`}
          onValueChange={(value) => {
            const [pitchRaw, mode] = value.split("|")
            const pitch = Number.parseFloat(pitchRaw)
            dispatch({
              type: "UPDATE_PROJECT",
              payload: {
                pitch_mm: Number.isFinite(pitch) ? pitch : 2.5,
                pitch_is_gob: mode === "gob",
              },
            })
          }}
        >
          <SelectTrigger id="pitch" className="h-8 w-24 bg-secondary text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1.25|std">P 1.25</SelectItem>
            <SelectItem value="1.25|gob">P 1.25 GOB</SelectItem>
            <SelectItem value="1.56|std">P 1.56</SelectItem>
            <SelectItem value="1.56|gob">P 1.56 GOB</SelectItem>
            <SelectItem value="1.86|std">P 1.86</SelectItem>
            <SelectItem value="1.86|gob">P 1.86 GOB</SelectItem>
            <SelectItem value="2.5|std">P 2.5</SelectItem>
            <SelectItem value="2.5|gob">P 2.5 GOB</SelectItem>
            <SelectItem value="4|std">P 4</SelectItem>
            <SelectItem value="4|gob">P 4 GOB</SelectItem>
            <SelectItem value="5|std">P 5</SelectItem>
            <SelectItem value="5|gob">P 5 GOB</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grid Settings */}
      <div className="flex items-center gap-2">
        <Grid3X3 className="w-4 h-4 text-muted-foreground" />
        <Switch
          checked={layout.project.grid.enabled}
          onCheckedChange={(checked) =>
            dispatch({
              type: "UPDATE_PROJECT",
              payload: { grid: { ...layout.project.grid, enabled: checked, step_mm: 160 } },
            })
          }
        />
        <span className="text-xs text-muted-foreground">160 mm</span>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="controller" className="text-xs text-muted-foreground">
          Controller
        </Label>
        <Select
          value={layout.project.controller}
          onValueChange={(value: "A100" | "A200" | "X8E") =>
            dispatch({ type: "UPDATE_PROJECT", payload: { controller: value } })
          }
        >
          <SelectTrigger className="h-8 w-24 bg-secondary text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A100">A100 (2 ports)</SelectItem>
            <SelectItem value="A200">A200 (4 ports)</SelectItem>
            <SelectItem value="X8E">X8E (8 ports)</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id="controller-label"
          aria-label="Custom controller label"
          value={layout.project.controllerLabel ?? ""}
          onChange={(e) => dispatch({ type: "UPDATE_PROJECT", payload: { controllerLabel: e.target.value } })}
          placeholder="Custom label"
          className="h-8 w-28 bg-secondary text-sm"
        />
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-2" />

        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-2" />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportOverviewPdf(layout)}>
          <FileDown className="w-4 h-4 mr-2" />
          PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportJSON}>
          <Download className="w-4 h-4 mr-2" />
          JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="text-destructive border-destructive/40 hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>
    </div>
  )
}
