"use client"

import type React from "react"

import { useState } from "react"
import { useEditor } from "@/lib/editor-context"
import type { CabinetType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, GripVertical } from "lucide-react"

export function CabinetLibrary() {
  const { state, dispatch, generateCabinetId } = useEditor()
  const { layout } = state
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newType, setNewType] = useState<Partial<CabinetType>>({
    typeId: "",
    width_mm: 640,
    height_mm: 640,
  })
  const [draggedType, setDraggedType] = useState<string | null>(null)

  const handleAddType = () => {
    if (!newType.typeId || !newType.width_mm || !newType.height_mm) return
    if (layout.cabinetTypes.find((t) => t.typeId === newType.typeId)) {
      alert("Type ID already exists")
      return
    }
    dispatch({
      type: "ADD_CABINET_TYPE",
      payload: newType as CabinetType,
    })
    dispatch({ type: "PUSH_HISTORY" })
    setNewType({ typeId: "", width_mm: 640, height_mm: 640 })
    setIsAddOpen(false)
  }

  const handleDeleteType = (typeId: string) => {
    const inUse = layout.cabinets.some((c) => c.typeId === typeId)
    if (inUse) {
      alert("Cannot delete type: currently in use by cabinets")
      return
    }
    dispatch({ type: "DELETE_CABINET_TYPE", payload: typeId })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDragStart = (e: React.DragEvent, typeId: string) => {
    setDraggedType(typeId)
    e.dataTransfer.setData("cabinetTypeId", typeId)
    e.dataTransfer.effectAllowed = "copy"
  }

  const handleDragEnd = () => {
    setDraggedType(null)
  }

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sidebar-foreground">Cabinet Library</h2>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Cabinet Type</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="type-id">Type ID</Label>
                  <Input
                    id="type-id"
                    placeholder="e.g., STD_800x480"
                    value={newType.typeId}
                    onChange={(e) => setNewType({ ...newType, typeId: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width (mm)</Label>
                    <Input
                      id="width"
                      type="number"
                      value={newType.width_mm}
                      onChange={(e) =>
                        setNewType({
                          ...newType,
                          width_mm: Number.parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height (mm)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={newType.height_mm}
                      onChange={(e) =>
                        setNewType({
                          ...newType,
                          height_mm: Number.parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                <Button onClick={handleAddType} className="w-full">
                  Add Type
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {layout.cabinetTypes.map((type) => (
            <div
              key={type.typeId}
              draggable
              onDragStart={(e) => handleDragStart(e, type.typeId)}
              onDragEnd={handleDragEnd}
              className={`group flex items-center gap-2 p-2 rounded-md cursor-grab active:cursor-grabbing transition-colors ${
                draggedType === type.typeId ? "bg-sidebar-accent opacity-50" : "hover:bg-sidebar-accent"
              }`}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              <div
                className="w-10 h-6 border border-cabinet-stroke bg-cabinet-fill rounded-sm flex items-center justify-center"
                style={{
                  aspectRatio: `${type.width_mm}/${type.height_mm}`,
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-sidebar-foreground">{type.typeId}</div>
                <div className="text-[10px] text-muted-foreground">
                  {type.width_mm} × {type.height_mm} mm
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDeleteType(type.typeId)}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground">Drag to canvas to place</div>
    </div>
  )
}
