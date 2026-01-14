"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, validateLayout } from "@/lib/validation"
import type { Cabinet } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize } from "lucide-react"

export function LayoutCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { state, dispatch, generateCabinetId } = useEditor()
  const { layout, zoom, panX, panY, selectedCabinetId } = state

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })
  const [isDraggingCabinet, setIsDraggingCabinet] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const errors = validateLayout(layout)
  const errorCabinetIds = new Set(errors.filter((e) => e.type === "error").flatMap((e) => e.cabinetIds))

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const x = (screenX - rect.left - panX) / zoom
      const y = (screenY - rect.top - panY) / zoom
      return { x, y }
    },
    [zoom, panX, panY],
  )

  // Snap position to grid
  const snapToGrid = useCallback(
    (x: number, y: number) => {
      if (!layout.project.grid.enabled) return { x, y }
      const step = layout.project.grid.step_mm
      return {
        x: Math.round(x / step) * step,
        y: Math.round(y / step) * step,
      }
    },
    [layout.project.grid],
  )

  // Find cabinet at position
  const findCabinetAt = useCallback(
    (worldX: number, worldY: number): Cabinet | null => {
      for (let i = layout.cabinets.length - 1; i >= 0; i--) {
        const cabinet = layout.cabinets[i]
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (bounds && worldX >= bounds.x && worldX <= bounds.x2 && worldY >= bounds.y && worldY <= bounds.y2) {
          return cabinet
        }
      }
      return null
    },
    [layout.cabinets, layout.cabinetTypes],
  )

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() || "#111"
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Draw grid
    if (layout.project.grid.enabled) {
      const step = layout.project.grid.step_mm
      const gridColor = getComputedStyle(document.documentElement).getPropertyValue("--grid-line").trim() || "#333"
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1 / zoom

      const startX = Math.floor(-panX / zoom / step) * step - step
      const startY = Math.floor(-panY / zoom / step) * step - step
      const endX = Math.ceil((rect.width - panX) / zoom / step) * step + step
      const endY = Math.ceil((rect.height - panY) / zoom / step) * step + step

      ctx.beginPath()
      for (let x = startX; x <= endX; x += step) {
        ctx.moveTo(x, startY)
        ctx.lineTo(x, endY)
      }
      for (let y = startY; y <= endY; y += step) {
        ctx.moveTo(startX, y)
        ctx.lineTo(endX, y)
      }
      ctx.stroke()
    }

    // Draw origin crosshair
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 2 / zoom
    ctx.beginPath()
    ctx.moveTo(-20, 0)
    ctx.lineTo(60, 0)
    ctx.moveTo(0, -20)
    ctx.lineTo(0, 60)
    ctx.stroke()

    // Draw cabinets
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return

      const isSelected = cabinet.id === selectedCabinetId
      const hasError = errorCabinetIds.has(cabinet.id)

      // Fill
      ctx.fillStyle = hasError
        ? "rgba(220, 38, 38, 0.3)"
        : isSelected
          ? "rgba(56, 189, 248, 0.3)"
          : "rgba(56, 189, 248, 0.15)"
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)

      // Stroke
      ctx.strokeStyle = hasError ? "#dc2626" : isSelected ? "#38bdf8" : "#3b82f6"
      ctx.lineWidth = isSelected ? 3 / zoom : 2 / zoom
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

      // Label
      ctx.fillStyle = isSelected ? "#38bdf8" : "#94a3b8"
      const fontSize = Math.max(12, 14 / zoom)
      ctx.font = `${fontSize}px Geist, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(cabinet.id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)

      // Type label
      ctx.fillStyle = "#64748b"
      const smallFontSize = Math.max(9, 10 / zoom)
      ctx.font = `${smallFontSize}px Geist Mono, monospace`
      ctx.fillText(
        cabinet.typeId.replace("STD_", ""),
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2 + fontSize / 2,
      )

      // Rotation indicator
      if (cabinet.rot_deg !== 0) {
        ctx.fillStyle = "#94a3b8"
        ctx.font = `${smallFontSize}px Geist Mono, monospace`
        ctx.textAlign = "right"
        ctx.fillText(`${cabinet.rot_deg}°`, bounds.x + bounds.width - 4, bounds.y + smallFontSize + 4)
      }
    })

    ctx.restore()

    // Draw scale indicator
    ctx.fillStyle = "#64748b"
    ctx.font = "11px Geist Mono, monospace"
    ctx.textAlign = "left"
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, 12, rect.height - 12)
  }, [layout, zoom, panX, panY, selectedCabinetId, errorCabinetIds])

  // Redraw on state changes
  useEffect(() => {
    draw()
  }, [draw])

  // Handle resize
  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY)
    const cabinet = findCabinetAt(world.x, world.y)

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or alt+click: start panning
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (cabinet) {
      // Click on cabinet: select and start dragging
      dispatch({ type: "SELECT_CABINET", payload: cabinet.id })
      setIsDraggingCabinet(true)
      setDragOffset({
        x: world.x - cabinet.x_mm,
        y: world.y - cabinet.y_mm,
      })
    } else {
      // Click on empty space: deselect
      dispatch({ type: "SELECT_CABINET", payload: null })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPos.x
      const dy = e.clientY - lastPanPos.y
      dispatch({ type: "SET_PAN", payload: { x: panX + dx, y: panY + dy } })
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (isDraggingCabinet && selectedCabinetId) {
      const world = screenToWorld(e.clientX, e.clientY)
      const snapped = snapToGrid(world.x - dragOffset.x, world.y - dragOffset.y)
      dispatch({
        type: "UPDATE_CABINET",
        payload: {
          id: selectedCabinetId,
          updates: { x_mm: snapped.x, y_mm: snapped.y },
        },
      })
    }
  }

  const handleMouseUp = () => {
    if (isDraggingCabinet) {
      dispatch({ type: "PUSH_HISTORY" })
    }
    setIsPanning(false)
    setIsDraggingCabinet(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta))

    // Zoom toward mouse position
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const worldX = (mouseX - panX) / zoom
      const worldY = (mouseY - panY) / zoom
      const newPanX = mouseX - worldX * newZoom
      const newPanY = mouseY - worldY * newZoom

      dispatch({ type: "SET_ZOOM", payload: newZoom })
      dispatch({ type: "SET_PAN", payload: { x: newPanX, y: newPanY } })
    }
  }

  // Handle drop from library
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const typeId = e.dataTransfer.getData("cabinetTypeId")
    if (!typeId) return

    const type = layout.cabinetTypes.find((t) => t.typeId === typeId)
    if (!type) return

    const world = screenToWorld(e.clientX, e.clientY)
    const snapped = snapToGrid(world.x - type.width_mm / 2, world.y - type.height_mm / 2)

    const newCabinet: Cabinet = {
      id: generateCabinetId(),
      typeId,
      x_mm: snapped.x,
      y_mm: snapped.y,
      rot_deg: 0,
    }

    dispatch({ type: "ADD_CABINET", payload: newCabinet })
    dispatch({ type: "PUSH_HISTORY" })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  // Zoom controls
  const handleZoomIn = () => dispatch({ type: "SET_ZOOM", payload: zoom * 1.2 })
  const handleZoomOut = () => dispatch({ type: "SET_ZOOM", payload: zoom / 1.2 })
  const handleFitToScreen = () => {
    if (layout.cabinets.length === 0) {
      dispatch({ type: "SET_ZOOM", payload: 0.5 })
      dispatch({ type: "SET_PAN", payload: { x: 100, y: 100 } })
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY
    layout.cabinets.forEach((c) => {
      const bounds = getCabinetBounds(c, layout.cabinetTypes)
      if (bounds) {
        minX = Math.min(minX, bounds.x)
        minY = Math.min(minY, bounds.y)
        maxX = Math.max(maxX, bounds.x2)
        maxY = Math.max(maxY, bounds.y2)
      }
    })

    const rect = canvas.getBoundingClientRect()
    const padding = 60
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const scaleX = (rect.width - padding * 2) / contentWidth
    const scaleY = (rect.height - padding * 2) / contentHeight
    const newZoom = Math.min(scaleX, scaleY, 2)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const newPanX = rect.width / 2 - centerX * newZoom
    const newPanY = rect.height / 2 - centerY * newZoom

    dispatch({ type: "SET_ZOOM", payload: newZoom })
    dispatch({ type: "SET_PAN", payload: { x: newPanX, y: newPanY } })
  }

  return (
    <div ref={containerRef} className="flex-1 relative bg-canvas overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-lg p-1 border border-border">
        <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleFitToScreen} className="h-8 w-8 p-0">
          <Maximize className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0">
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
