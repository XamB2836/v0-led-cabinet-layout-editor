"use client"

import type React from "react"

import { useMemo, useState } from "react"
import { useEditor } from "@/lib/editor-context"
import type { CabinetType } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus } from "lucide-react"

export function CabinetLibrary() {
  const { state, dispatch } = useEditor()
  const { layout } = state
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newType, setNewType] = useState<Partial<CabinetType>>({
    typeId: "",
    width_mm: 640,
    height_mm: 640,
  })
  const [draggedType, setDraggedType] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const sizeMatch = query.match(/(\d+)\s*[xX]\s*(\d+)/)
    const sizeQuery = sizeMatch
      ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
      : null
    const singleMatch = !sizeQuery ? query.match(/\d+/) : null
    const singleValue = singleMatch ? Number(singleMatch[0]) : null
    return layout.cabinetTypes
      .filter((type) => {
        if (!query) return true
        const label = `${type.width_mm}x${type.height_mm}`
        if (label.includes(query)) return true
        if (!sizeQuery) return false
        return (
          (type.width_mm === sizeQuery.width && type.height_mm === sizeQuery.height) ||
          (type.width_mm === sizeQuery.height && type.height_mm === sizeQuery.width)
        )
      })
      .sort((a, b) => {
        if (!query) {
          if (a.width_mm !== b.width_mm) return b.width_mm - a.width_mm
          return b.height_mm - a.height_mm
        }
        if (singleValue !== null) {
          const score = (type: CabinetType) => {
            const matchesWidth = type.width_mm === singleValue
            const matchesHeight = type.height_mm === singleValue
            const matchCount = (matchesWidth ? 1 : 0) + (matchesHeight ? 1 : 0)
            const distance = Math.min(
              Math.abs(type.width_mm - singleValue),
              Math.abs(type.height_mm - singleValue),
            )
            return { matchCount, distance }
          }
          const aScore = score(a)
          const bScore = score(b)
          if (aScore.matchCount !== bScore.matchCount) return bScore.matchCount - aScore.matchCount
          if (aScore.distance !== bScore.distance) return aScore.distance - bScore.distance
        }
        if (sizeQuery) {
          const score = (type: CabinetType) => {
            const directExact = type.width_mm === sizeQuery.width && type.height_mm === sizeQuery.height
            const swapExact = type.width_mm === sizeQuery.height && type.height_mm === sizeQuery.width
            if (directExact) return 0
            if (swapExact) return 1
            const directDist =
              Math.abs(type.width_mm - sizeQuery.width) + Math.abs(type.height_mm - sizeQuery.height)
            const swapDist =
              Math.abs(type.width_mm - sizeQuery.height) +
              Math.abs(type.height_mm - sizeQuery.width) +
              200
            return Math.min(directDist, swapDist)
          }
          const scoreA = score(a)
          const scoreB = score(b)
          if (scoreA !== scoreB) return scoreA - scoreB
        }
        const areaA = a.width_mm * a.height_mm
        const areaB = b.width_mm * b.height_mm
        if (areaA !== areaB) return areaB - areaA
        if (a.height_mm !== b.height_mm) return b.height_mm - a.height_mm
        return b.width_mm - a.width_mm
      })
  }, [layout.cabinetTypes, search])

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

      <div className="p-3 border-b border-sidebar-border space-y-2">
        <Input
          placeholder="Search size (e.g. 960x640)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 bg-secondary text-xs"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 pr-4 space-y-2">
          {filteredTypes.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">No sizes match.</div>
          ) : (
            filteredTypes.map((type) => {
              const label = `${type.width_mm}x${type.height_mm}`
              return (
                <div
                  key={type.typeId}
                  draggable
                  title={label}
                  onDragStart={(e) => handleDragStart(e, type.typeId)}
                  onDragEnd={handleDragEnd}
                  className={`group flex items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-2 cursor-grab active:cursor-grabbing transition-colors ${
                    draggedType === type.typeId ? "bg-sidebar-accent/70 opacity-60" : "hover:bg-sidebar-accent/50"
                  }`}
                >
                  <div
                    className="w-10 h-6 border border-cabinet-stroke bg-cabinet-fill rounded-sm"
                    style={{ aspectRatio: `${type.width_mm}/${type.height_mm}` }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-sidebar-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground">{type.width_mm} x {type.height_mm} mm</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border text-xs text-muted-foreground">Drag to canvas to place</div>
    </div>
  )
}



