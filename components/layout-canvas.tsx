"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, validateLayout } from "@/lib/validation"
import type { Cabinet, CabinetType, DataRoute, PowerFeed } from "@/lib/types"
import { computeGridLabel } from "@/lib/types"
import { getBreakerSafeMaxW, getPowerFeedLoadW } from "@/lib/power-utils"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize, Ruler } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function getLayoutBoundsFromCabinets(
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (cabinets.length === 0) return null

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY

  cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, cabinetTypes)
    if (bounds) {
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x2)
      maxY = Math.max(maxY, bounds.y2)
    }
  })

  if (minX === Number.POSITIVE_INFINITY) return null
  return { minX, minY, maxX, maxY }
}

function drawDimension(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  value: number,
  zoom: number,
  orientation: "horizontal" | "vertical",
  offset = 40,
  color = "#22d3ee",
  pixelValue?: number,
) {
  const arrowSize = Math.max(6, 8 / zoom)
  const extensionLength = Math.max(8, 12 / zoom)
  const fontSize = Math.max(10, 12 / zoom)
  const lineWidth = Math.max(1, 1.5 / zoom)

  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  let text = `${value} mm`
  if (pixelValue !== undefined) {
    text += ` (${pixelValue} px)`
  }

  if (orientation === "horizontal") {
    const dimY = y1 - offset

    ctx.beginPath()
    ctx.moveTo(x1, y1 - extensionLength / 2)
    ctx.lineTo(x1, dimY - extensionLength)
    ctx.moveTo(x2, y1 - extensionLength / 2)
    ctx.lineTo(x2, dimY - extensionLength)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x1, dimY)
    ctx.lineTo(x2, dimY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x1, dimY)
    ctx.lineTo(x1 + arrowSize, dimY - arrowSize / 2)
    ctx.lineTo(x1 + arrowSize, dimY + arrowSize / 2)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x2, dimY)
    ctx.lineTo(x2 - arrowSize, dimY - arrowSize / 2)
    ctx.lineTo(x2 - arrowSize, dimY + arrowSize / 2)
    ctx.closePath()
    ctx.fill()

    const textX = (x1 + x2) / 2
    const textY = dimY
    const textWidth = ctx.measureText(text).width + 12

    ctx.fillStyle = "#0a0a0a"
    ctx.fillRect(textX - textWidth / 2, textY - fontSize / 2 - 3, textWidth, fontSize + 6)
    ctx.fillStyle = color
    ctx.fillText(text, textX, textY)
  } else {
    const dimX = x2 + offset

    ctx.beginPath()
    ctx.moveTo(x2 + extensionLength / 2, y1)
    ctx.lineTo(dimX + extensionLength, y1)
    ctx.moveTo(x2 + extensionLength / 2, y2)
    ctx.lineTo(dimX + extensionLength, y2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(dimX, y1)
    ctx.lineTo(dimX, y2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(dimX, y1)
    ctx.lineTo(dimX - arrowSize / 2, y1 + arrowSize)
    ctx.lineTo(dimX + arrowSize / 2, y1 + arrowSize)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(dimX, y2)
    ctx.lineTo(dimX - arrowSize / 2, y2 - arrowSize)
    ctx.lineTo(dimX + arrowSize / 2, y2 - arrowSize)
    ctx.closePath()
    ctx.fill()

    const textX = dimX
    const textY = (y1 + y2) / 2
    const textWidth = ctx.measureText(text).width + 12

    ctx.save()
    ctx.translate(textX, textY)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = "#0a0a0a"
    ctx.fillRect(-textWidth / 2, -fontSize / 2 - 3, textWidth, fontSize + 6)
    ctx.fillStyle = color
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

function drawOverallDimensions(
  ctx: CanvasRenderingContext2D,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
  pitch_mm: number,
  showPixels: boolean,
) {
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { minX, minY, maxX, maxY } = layoutBounds

  const totalWidth = Math.round(maxX - minX)
  const totalHeight = Math.round(maxY - minY)

  const widthPx = showPixels ? Math.round(totalWidth / pitch_mm) : undefined
  const heightPx = showPixels ? Math.round(totalHeight / pitch_mm) : undefined

  drawDimension(ctx, minX, minY, maxX, minY, totalWidth, zoom, "horizontal", 80, "#f59e0b", widthPx)
  drawDimension(ctx, maxX, minY, maxX, maxY, totalHeight, zoom, "vertical", 80, "#f59e0b", heightPx)
}

function getReceiverCardRect(bounds: { x: number; y: number; width: number; height: number }, zoom: number) {
  const minWidth = 48 / zoom
  const maxWidth = 84 / zoom
  const minHeight = 12 / zoom
  const maxHeight = 18 / zoom
  const cardWidth = Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
  const cardHeight = Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
  const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
  const cardY = bounds.y + bounds.height / 2 - cardHeight / 2
  const connectorX = cardX + cardWidth / 2
  const connectorY = cardY + cardHeight + 6 / zoom

  return {
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    centerX: cardX + cardWidth / 2,
    centerY: cardY + cardHeight / 2,
    connectorX,
    connectorY,
  }
}

function fitTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  suffix = "...",
) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}${suffix}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.length > 0 ? `${trimmed}${suffix}` : suffix
}

function drawReceiverCard(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  model: string,
  zoom: number,
) {
  const { x, y, width, height, centerX, centerY, connectorX, connectorY } = getReceiverCardRect(bounds, zoom)
  const fontSize = 8 / zoom
  const padding = 4 / zoom

  ctx.save()
  ctx.shadowColor = "rgba(2, 6, 23, 0.6)"
  ctx.shadowBlur = 5 / zoom
  ctx.shadowOffsetY = 2 / zoom
  ctx.fillStyle = "#0b1220"
  ctx.fillRect(x, y, width, height)
  ctx.restore()

  ctx.strokeStyle = "#1f2a44"
  ctx.lineWidth = 1 / zoom
  ctx.strokeRect(x, y, width, height)

  ctx.fillStyle = "#0f172a"
  ctx.fillRect(x + 1 / zoom, y + 1 / zoom, width - 2 / zoom, 2 / zoom)

  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const fitted = fitTextToWidth(ctx, model, width - padding * 2)
  ctx.fillText(fitted, centerX, centerY)

  ctx.fillStyle = "#3b82f6"
  ctx.beginPath()
  ctx.arc(connectorX, connectorY, 3.2 / zoom, 0, Math.PI * 2)
  ctx.fill()
}

function drawGridLabel(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  label: string,
  zoom: number,
) {
  const fontSize = Math.max(11, 13 / zoom)
  const padding = 4 / zoom

  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  const textWidth = ctx.measureText(label).width

  const boxX = bounds.x + padding
  const boxY = bounds.y + padding
  const boxW = textWidth + 8 / zoom
  const boxH = fontSize + 6 / zoom

  ctx.fillStyle = "rgba(245, 158, 11, 0.9)"
  ctx.fillRect(boxX, boxY, boxW, boxH)

  ctx.fillStyle = "#000000"
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillText(label, boxX + 4 / zoom, boxY + 3 / zoom)
}

function drawDataRoutes(
  ctx: CanvasRenderingContext2D,
  dataRoutes: DataRoute[],
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
  showReceiverCards: boolean,
  receiverCardModel: string,
) {
  const lineWidth = Math.max(2, 2.5 / zoom)
  const arrowSize = Math.max(6, 8 / zoom)
  const fontSize = Math.max(9, 10 / zoom)

  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { maxY } = layoutBounds

  dataRoutes.forEach((route) => {
    if (route.cabinetIds.length === 0) return

    ctx.save()
    ctx.strokeStyle = "#3b82f6"
    ctx.fillStyle = "#3b82f6"
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    // Get cabinet centers in order
    const points: { x: number; y: number; bounds: ReturnType<typeof getCabinetBounds> }[] = []
    route.cabinetIds.forEach((id) => {
      const cabinet = cabinets.find((c) => c.id === id)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const hasReceiverCard =
        showReceiverCards &&
        (cabinet.receiverCardOverride === null ? false : !!(cabinet.receiverCardOverride || receiverCardModel))
      const anchor = hasReceiverCard
        ? getReceiverCardRect(bounds, zoom)
        : { connectorX: bounds.x + bounds.width / 2, connectorY: bounds.y + bounds.height / 2 }
      points.push({
        x: anchor.connectorX,
        y: anchor.connectorY,
        bounds,
      })
    })

    if (points.length === 0) {
      ctx.restore()
      return
    }

    // Draw port label at bottom
    const portLabelY = maxY + 60 / zoom
    const firstPoint = points[0]
    const portLabelX = firstPoint.x

    // Port label box
    const portLabel = `Port ${route.port}`
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    const labelWidth = ctx.measureText(portLabel).width + 16 / zoom
    const labelHeight = fontSize + 10 / zoom

    ctx.fillStyle = "#3b82f6"
    ctx.fillRect(portLabelX - labelWidth / 2, portLabelY - labelHeight / 2, labelWidth, labelHeight)
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(portLabel, portLabelX, portLabelY)

    // Draw line from port to first cabinet
    ctx.strokeStyle = "#3b82f6"
    ctx.beginPath()
    ctx.moveTo(portLabelX, portLabelY - labelHeight / 2)
    ctx.lineTo(portLabelX, firstPoint.y)
    ctx.stroke()

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]

        // Simple orthogonal routing: go vertical first, then horizontal
        const midY = (prev.y + curr.y) / 2

        // Check if primarily horizontal or vertical movement
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          // Same row - direct horizontal line
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          // Same column - direct vertical line
          ctx.lineTo(curr.x, curr.y)
        } else {
          // Different row and column - L-shaped path
          ctx.lineTo(prev.x, midY)
          ctx.lineTo(curr.x, midY)
          ctx.lineTo(curr.x, curr.y)
        }
      }
      ctx.stroke()

      // Draw arrow at end
      const lastPoint = points[points.length - 1]
      const secondLast = points[points.length - 2]

      // Arrow pointing in direction of last segment
      let angle: number
      if (Math.abs(lastPoint.x - secondLast.x) < 10) {
        // Vertical movement
        angle = lastPoint.y > secondLast.y ? Math.PI / 2 : -Math.PI / 2
      } else {
        // Horizontal movement
        angle = lastPoint.x > secondLast.x ? 0 : Math.PI
      }

      ctx.beginPath()
      ctx.moveTo(lastPoint.x + arrowSize * Math.cos(angle), lastPoint.y + arrowSize * Math.sin(angle))
      ctx.lineTo(
        lastPoint.x - arrowSize * 0.5 * Math.cos(angle - Math.PI / 4),
        lastPoint.y - arrowSize * 0.5 * Math.sin(angle - Math.PI / 4),
      )
      ctx.lineTo(
        lastPoint.x - arrowSize * 0.5 * Math.cos(angle + Math.PI / 4),
        lastPoint.y - arrowSize * 0.5 * Math.sin(angle + Math.PI / 4),
      )
      ctx.closePath()
      ctx.fill()
    }

    ctx.restore()
  })
}

function drawPowerFeeds(
  ctx: CanvasRenderingContext2D,
  powerFeeds: PowerFeed[],
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
) {
  const lineWidth = Math.max(3, 3.5 / zoom)
  const fontSize = Math.max(8, 9 / zoom)

  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  powerFeeds.forEach((feed) => {
    if (feed.assignedCabinetIds.length === 0) return

    ctx.save()
    ctx.strokeStyle = "#f97316"
    ctx.fillStyle = "#f97316"
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const points: { x: number; y: number; bounds: ReturnType<typeof getCabinetBounds> }[] = []
    feed.assignedCabinetIds.forEach((id) => {
      const cabinet = cabinets.find((c) => c.id === id)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const anchorX = bounds.x + bounds.width * 0.65
      points.push({
        x: anchorX,
        y: bounds.y + bounds.height / 2,
        bounds,
      })
    })

    if (points.length === 0) {
      ctx.restore()
      return
    }

    const feedBounds = getLayoutBoundsFromCabinets(
      cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
      cabinetTypes,
    )
    if (!feedBounds) {
      ctx.restore()
      return
    }

    // Draw label box at bottom
    const labelY = feedBounds.maxY + 110 / zoom
    const labelPadding = 6 / zoom

    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    const labelText = feed.label
    const breakerText = feed.breaker || feed.label
    const loadW = getPowerFeedLoadW(feed, cabinets, cabinetTypes)
    const safeMaxW = getBreakerSafeMaxW(feed.breaker)
    const consumptionText = safeMaxW ? `Load: ${loadW} W / ${safeMaxW} W` : `Load: ${loadW} W`
    const connectorText = feed.connector

    const maxTextWidth = Math.max(
      ctx.measureText(labelText).width,
      ctx.measureText(breakerText).width,
      ctx.measureText(consumptionText).width,
      ctx.measureText(connectorText).width,
    )
    const boxWidth = maxTextWidth + labelPadding * 2
    const boxHeight = fontSize * 4.6 + labelPadding * 2
    const boxX = points[0].x

    // Background box
    ctx.fillStyle = "rgba(249, 115, 22, 0.95)"
    ctx.fillRect(boxX - boxWidth / 2, labelY, boxWidth, boxHeight)

    // Text
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    ctx.fillText(labelText, boxX, labelY + labelPadding)
    ctx.font = `${fontSize * 0.85}px Inter, sans-serif`
    ctx.fillText(breakerText, boxX, labelY + labelPadding + fontSize * 1.1)
    ctx.fillText(connectorText, boxX, labelY + labelPadding + fontSize * 2.2)
    ctx.font = `bold ${fontSize * 0.9}px Inter, sans-serif`
    ctx.fillText(consumptionText, boxX, labelY + labelPadding + fontSize * 3.3)

    // Draw line from breaker label to first cabinet
    ctx.strokeStyle = "#f97316"
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(boxX, labelY)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else {
          // Keep the horizontal segment on the previous cabinet row to avoid "H" shapes.
          ctx.lineTo(curr.x, prev.y)
          ctx.lineTo(curr.x, curr.y)
        }
      }
      ctx.stroke()
    }

    ctx.restore()
  })
}

function drawControllerPorts(
  ctx: CanvasRenderingContext2D,
  controller: "A100" | "A200",
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
) {
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { minX, maxX, maxY } = layoutBounds

  const numPorts = controller === "A100" ? 2 : 4
  const boxWidth = Math.max(100, 120 / zoom)
  const boxHeight = Math.max(35, 40 / zoom)
  const fontSize = Math.max(10, 11 / zoom)

  const boxX = (minX + maxX) / 2 - boxWidth / 2
  const boxY = maxY + 100 / zoom

  ctx.save()

  ctx.fillStyle = "#1e293b"
  ctx.strokeStyle = "#475569"
  ctx.lineWidth = 2 / zoom
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(controller, boxX + boxWidth / 2, boxY + boxHeight / 2)

  ctx.restore()
}

export function LayoutCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { state, dispatch, generateCabinetId } = useEditor()
  const { layout, zoom, panX, panY, selectedCabinetId, showDimensions, routingMode } = state

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })
  const [isDraggingCabinet, setIsDraggingCabinet] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const errors = validateLayout(layout)
  const errorCabinetIds = new Set(errors.filter((e) => e.type === "error").flatMap((e) => e.cabinetIds))

  const activeCabinetIds = new Set<string>()
  if (routingMode.type === "data") {
    const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
    route?.cabinetIds.forEach((id) => activeCabinetIds.add(id))
  } else if (routingMode.type === "power") {
    const feed = layout.project.powerFeeds.find((f) => f.id === routingMode.feedId)
    feed?.assignedCabinetIds.forEach((id) => activeCabinetIds.add(id))
  }
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = "#0f0f0f"
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    if (layout.project.grid.enabled) {
      const step = layout.project.grid.step_mm
      ctx.strokeStyle = "#1a1a1a"
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

    // Origin
    ctx.strokeStyle = "#333"
    ctx.lineWidth = 2 / zoom
    ctx.beginPath()
    ctx.moveTo(-20, 0)
    ctx.lineTo(60, 0)
    ctx.moveTo(0, -20)
    ctx.lineTo(0, 60)
    ctx.stroke()

    const { overview, dataRoutes, powerFeeds, controller } = layout.project
    const labelsMode = overview?.labelsMode || "internal"
    const showReceiverCards = overview?.showReceiverCards ?? true
    const receiverCardModel = overview?.receiverCardModel || "5A75-E"
    const showDataRoutes = overview?.showDataRoutes ?? true
    const showPowerRoutes = overview?.showPowerRoutes ?? true

    // Draw cabinets
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return

      const isSelected = cabinet.id === selectedCabinetId
      const hasError = errorCabinetIds.has(cabinet.id)
      const isInActiveRoute = activeCabinetIds.has(cabinet.id)

      let fillColor = "rgba(56, 189, 248, 0.15)"
      let strokeColor = "#3b82f6"

      if (hasError) {
        fillColor = "rgba(220, 38, 38, 0.3)"
        strokeColor = "#dc2626"
      } else if (isSelected) {
        fillColor = "rgba(56, 189, 248, 0.3)"
        strokeColor = "#38bdf8"
      } else if (isInActiveRoute) {
        if (routingMode.type === "data") {
          fillColor = "rgba(59, 130, 246, 0.3)"
          strokeColor = "#3b82f6"
        } else if (routingMode.type === "power") {
          fillColor = "rgba(249, 115, 22, 0.3)"
          strokeColor = "#f97316"
        }
      }

      ctx.fillStyle = fillColor
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSelected || isInActiveRoute ? 3 / zoom : 2 / zoom
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

      if (labelsMode === "grid") {
        const displayLabel = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes)
        drawGridLabel(ctx, bounds, displayLabel, zoom)
      }

      ctx.fillStyle = "#64748b"
      const smallFontSize = Math.max(8, 9 / zoom)
      ctx.font = `${smallFontSize}px Inter, sans-serif`
      ctx.textAlign = "center"
      ctx.fillText(
        cabinet.typeId.replace("STD_", ""),
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height - 25 / zoom,
      )

      if (cabinet.rot_deg !== 0) {
        ctx.fillStyle = "#94a3b8"
        ctx.font = `${smallFontSize}px Inter, sans-serif`
        ctx.textAlign = "right"
        ctx.fillText(`${cabinet.rot_deg}°`, bounds.x + bounds.width - 4, bounds.y + smallFontSize + 4)
      }

      if (routingMode.type === "data" && isInActiveRoute) {
        const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
        if (route) {
          const chainIndex = route.cabinetIds.indexOf(cabinet.id) + 1
          if (chainIndex > 0) {
            const badgeSize = 20 / zoom
            const badgeX = bounds.x + bounds.width - badgeSize - 4 / zoom
            const badgeY = bounds.y + bounds.height - badgeSize - 4 / zoom

            ctx.fillStyle = "#3b82f6"
            ctx.beginPath()
            ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = "#ffffff"
            ctx.font = `bold ${Math.max(9, 10 / zoom)}px Inter, sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(`${chainIndex}`, badgeX + badgeSize / 2, badgeY + badgeSize / 2)
          }
        }
      }

      if (showDimensions && isSelected) {
        drawDimension(
          ctx,
          bounds.x,
          bounds.y,
          bounds.x + bounds.width,
          bounds.y,
          bounds.width,
          zoom,
          "horizontal",
          30,
          "#22d3ee",
        )
        drawDimension(
          ctx,
          bounds.x + bounds.width,
          bounds.y,
          bounds.x + bounds.width,
          bounds.y + bounds.height,
          bounds.height,
          zoom,
          "vertical",
          30,
          "#22d3ee",
        )
      }
    })

    // Draw data routes above cabinets but under receiver cards
    if (showDataRoutes && dataRoutes && dataRoutes.length > 0) {
      drawDataRoutes(
        ctx,
        dataRoutes,
        layout.cabinets,
        layout.cabinetTypes,
        zoom,
        showReceiverCards,
        receiverCardModel,
      )
    }

    // Draw power feeds above data routes
    if (showPowerRoutes && powerFeeds && powerFeeds.length > 0) {
      drawPowerFeeds(ctx, powerFeeds, layout.cabinets, layout.cabinetTypes, zoom)
    }

    // Draw receiver cards on top so data lines sit underneath the label
    if (showReceiverCards) {
      layout.cabinets.forEach((cabinet) => {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (!bounds) return
        const cardModel =
          cabinet.receiverCardOverride === null ? null : cabinet.receiverCardOverride || receiverCardModel
        if (cardModel) {
          drawReceiverCard(ctx, bounds, cardModel, zoom)
        }
      })
    }

    // Draw controller
    if (layout.cabinets.length > 0) {
      drawControllerPorts(ctx, controller, layout.cabinets, layout.cabinetTypes, zoom)
    }

    if (showDimensions && layout.cabinets.length > 0) {
      const showPixels = overview?.showPixels ?? true
      drawOverallDimensions(ctx, layout.cabinets, layout.cabinetTypes, zoom, layout.project.pitch_mm, showPixels)
    }

    ctx.restore()

    // UI overlay
    ctx.fillStyle = "#64748b"
    ctx.font = "11px Inter, sans-serif"
    ctx.textAlign = "left"
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, 12, rect.height - 12)

    if (routingMode.type !== "none") {
      const modeText =
        routingMode.type === "data"
          ? `Routing: Port ${layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)?.port || "?"} - Click cabinets to add/remove`
          : `Power Feed - Click cabinets to assign`

      ctx.fillStyle = routingMode.type === "data" ? "#3b82f6" : "#f97316"
      ctx.font = "bold 12px Inter, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(modeText, rect.width / 2, 24)

      ctx.fillStyle = "#94a3b8"
      ctx.font = "11px Inter, sans-serif"
      ctx.fillText("Press ESC to exit routing mode", rect.width / 2, 42)
    }
  }, [layout, zoom, panX, panY, selectedCabinetId, errorCabinetIds, showDimensions, routingMode, activeCabinetIds])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && routingMode.type !== "none") {
        dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
        dispatch({ type: "PUSH_HISTORY" })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [routingMode, dispatch])

  const handleMouseDown = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY)
    const cabinet = findCabinetAt(world.x, world.y)

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (cabinet) {
      if (routingMode.type === "data") {
        dispatch({
          type: "ADD_CABINET_TO_ROUTE",
          payload: { routeId: routingMode.routeId, cabinetId: cabinet.id },
        })
      } else if (routingMode.type === "power") {
        dispatch({
          type: "ADD_CABINET_TO_POWER_FEED",
          payload: { feedId: routingMode.feedId, cabinetId: cabinet.id },
        })
      } else {
        // Normal selection/drag
        dispatch({ type: "SELECT_CABINET", payload: cabinet.id })
        setIsDraggingCabinet(true)
        setDragOffset({
          x: world.x - cabinet.x_mm,
          y: world.y - cabinet.y_mm,
        })
      }
    } else {
      dispatch({ type: "SELECT_CABINET", payload: null })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPos.x
      const dy = e.clientY - lastPanPos.y
      dispatch({ type: "SET_PAN", payload: { x: panX + dx, y: panY + dy } })
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (isDraggingCabinet && selectedCabinetId && routingMode.type === "none") {
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    // Don't allow drops in routing mode
    if (routingMode.type !== "none") return

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

    const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
    if (!layoutBounds) return

    const { minX, minY, maxX, maxY } = layoutBounds

    const rect = canvas.getBoundingClientRect()
    const padding = 150
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY + 200
    const scaleX = (rect.width - padding * 2) / contentWidth
    const scaleY = (rect.height - padding * 2) / contentHeight
    const newZoom = Math.min(scaleX, scaleY, 2)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY + 100) / 2
    const newPanX = rect.width / 2 - centerX * newZoom
    const newPanY = rect.height / 2 - centerY * newZoom

    dispatch({ type: "SET_ZOOM", payload: newZoom })
    dispatch({ type: "SET_PAN", payload: { x: newPanX, y: newPanY } })
  }

  const cursorClass = routingMode.type !== "none" ? "cursor-pointer" : "cursor-crosshair"

  return (
    <div ref={containerRef} className="flex-1 relative bg-[#0f0f0f] overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />

      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-zinc-900/90 backdrop-blur-sm rounded-lg p-1 border border-zinc-800">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDimensions ? "secondary" : "ghost"}
                size="sm"
                onClick={() => dispatch({ type: "TOGGLE_DIMENSIONS" })}
                className="h-8 w-8 p-0"
              >
                <Ruler className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{showDimensions ? "Hide" : "Show"} Dimensions (D)</p>
            </TooltipContent>
          </Tooltip>
          <div className="w-px h-6 bg-zinc-700 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0">
                <ZoomOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleFitToScreen} className="h-8 w-8 p-0">
                <Maximize className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fit to Screen</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0">
                <ZoomIn className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
