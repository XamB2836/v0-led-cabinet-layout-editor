"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, validateLayout } from "@/lib/validation"
import type { Cabinet, CabinetType, DataRoute, PowerFeed } from "@/lib/types"
import {
  computeGridLabel,
  formatRouteCabinetId,
  getCabinetReceiverCardCount,
  parseRouteCabinetId,
} from "@/lib/types"
import { isDataRouteOverCapacity } from "@/lib/data-utils"
import { getPowerFeedLoadW, isPowerFeedOverloaded } from "@/lib/power-utils"
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

type ReceiverCardRect = {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
  connectorX: number
  connectorY: number
}

function getReceiverCardRect(bounds: { x: number; y: number; width: number; height: number }, zoom: number): ReceiverCardRect {
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

function getReceiverCardRects(
  bounds: { x: number; y: number; width: number; height: number } | null,
  zoom: number,
  count: 0 | 1 | 2,
): ReceiverCardRect[] {
  if (!bounds || count <= 0) return []
  const base = getReceiverCardRect(bounds, zoom)
  if (count === 1) return [base]

  const gap = Math.min(10 / zoom, base.height)
  const totalHeight = base.height * 2 + gap
  const startY = bounds.y + bounds.height / 2 - totalHeight / 2
  const cardX = base.x
  const connectorOffset = 6 / zoom

  const top: ReceiverCardRect = {
    ...base,
    x: cardX,
    y: startY,
    centerX: cardX + base.width / 2,
    centerY: startY + base.height / 2,
    connectorX: cardX + base.width / 2,
    connectorY: startY + base.height + connectorOffset,
  }
  const bottomY = startY + base.height + gap
  const bottom: ReceiverCardRect = {
    ...base,
    x: cardX,
    y: bottomY,
    centerX: cardX + base.width / 2,
    centerY: bottomY + base.height / 2,
    connectorX: cardX + base.width / 2,
    connectorY: bottomY + base.height + connectorOffset,
  }
  return [top, bottom]
}

function getReceiverCardIndexAtPoint(
  bounds: { x: number; y: number; width: number; height: number } | null,
  zoom: number,
  count: 0 | 1 | 2,
  pointX: number,
  pointY: number,
): number | null {
  if (!bounds) return null
  const rects = getReceiverCardRects(bounds, zoom, count)
  if (rects.length === 0) return null
  const hitIndex = rects.findIndex(
    (rect) => pointX >= rect.x && pointX <= rect.x + rect.width && pointY >= rect.y && pointY <= rect.y + rect.height,
  )
  if (hitIndex !== -1) return hitIndex
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  rects.forEach((rect, index) => {
    const distance = Math.abs(pointY - rect.centerY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function scaledWorldSize(basePx: number, zoom: number, minPx: number, maxPx: number) {
  const sizePx = clamp(basePx * zoom, minPx, maxPx)
  return sizePx / zoom
}

function getPowerAnchorPoint(cardRect: ReceiverCardRect, zoom: number) {
  const anchorOffset = 6 / zoom
  return { x: cardRect.x - anchorOffset, y: cardRect.centerY }
}

function drawPowerAnchorDot(ctx: CanvasRenderingContext2D, cardRect: ReceiverCardRect, zoom: number) {
  const { x, y } = getPowerAnchorPoint(cardRect, zoom)
  const radius = 3.2 / zoom
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = "#f97316"
  ctx.fill()
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
  rect: ReceiverCardRect,
  model: string,
  zoom: number,
) {
  const { x, y, width, height, centerX, centerY, connectorX, connectorY } = rect
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawDataRoutes(
  ctx: CanvasRenderingContext2D,
  dataRoutes: DataRoute[],
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
  showReceiverCards: boolean,
  receiverCardModel: string,
  forcePortLabelsBottom: boolean,
  pitchMm: number,
) {
  const lineWidth = scaledWorldSize(5, zoom, 3, 9)
  const outlineWidth = lineWidth + scaledWorldSize(3, zoom, 2, 6)
  const arrowSize = scaledWorldSize(12, zoom, 8, 20)
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPadding = scaledWorldSize(8, zoom, 6, 12)
  const labelRadius = scaledWorldSize(6, zoom, 4, 10)
  const labelOffset = 90
  const labelSideGap = scaledWorldSize(60, zoom, 40, 90)

  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { maxY } = layoutBounds
  const rowCenters: number[] = []
  const rowTolerance = 50
  cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, cabinetTypes)
    if (!bounds) return
    const centerY = bounds.y + bounds.height / 2
    const existingRow = rowCenters.find((rowY) => Math.abs(rowY - centerY) < rowTolerance)
    if (!existingRow) rowCenters.push(centerY)
  })
  rowCenters.sort((a, b) => a - b)

  dataRoutes.forEach((route) => {
    if (route.cabinetIds.length === 0) return

    const isOverloaded = isDataRouteOverCapacity(route, cabinets, cabinetTypes, pitchMm)
    const lineColor = isOverloaded ? "#ef4444" : "#3b82f6"

    ctx.save()
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    // Get cabinet centers in order
    const points: {
      x: number
      y: number
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>>
      hasReceiverCard: boolean
      cardIndex?: number
    }[] = []
    route.cabinetIds.forEach((endpointId) => {
      const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
      const cabinet = cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      if (cardCount === 0) return
      const rects = getReceiverCardRects(bounds, zoom, cardCount)
      const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
      const anchorRect = rects[resolvedIndex]
      const hasReceiverCard =
        showReceiverCards &&
        (cabinet.receiverCardOverride === null ? false : !!(cabinet.receiverCardOverride || receiverCardModel))
      const anchor = anchorRect
        ? { connectorX: anchorRect.connectorX, connectorY: anchorRect.connectorY }
        : { connectorX: bounds.x + bounds.width / 2, connectorY: bounds.y + bounds.height / 2 }
      points.push({
        x: anchor.connectorX,
        y: anchor.connectorY,
        bounds,
        cardIndex: resolvedIndex,
        hasReceiverCard,
      })
    })

    if (points.length === 0) {
      ctx.restore()
      return
    }

    const firstPoint = points[0]
    const firstBounds = firstPoint.bounds
    const portLabel = `Port ${route.port}`
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    const labelWidth = ctx.measureText(portLabel).width + labelPadding * 2
    const labelHeight = fontSize + labelPadding * 1.6
    const portLabelCenterY = firstPoint.y
    const forceBottom = route.forcePortLabelBottom ?? forcePortLabelsBottom
    const resolvedPosition = (() => {
      if (route.labelPosition && route.labelPosition !== "auto") return route.labelPosition
      if (forceBottom) return "bottom"
      let placeSide = false
      if (firstBounds && rowCenters.length > 1) {
        const centerY = firstBounds.y + firstBounds.height / 2
        let rowIndex = rowCenters.findIndex((rowY) => Math.abs(rowY - centerY) < rowTolerance)
        if (rowIndex === -1) {
          rowIndex = rowCenters.reduce((bestIndex, rowY, index) => {
            const bestDistance = Math.abs(rowCenters[bestIndex] - centerY)
            const distance = Math.abs(rowY - centerY)
            return distance < bestDistance ? index : bestIndex
          }, 0)
        }
        placeSide = rowIndex < rowCenters.length - 1
      }
      if (!placeSide) return "bottom"
      const layoutCenterX = (layoutBounds.minX + layoutBounds.maxX) / 2
      const firstCenterX = firstBounds ? firstBounds.x + firstBounds.width / 2 : firstPoint.x
      return firstCenterX >= layoutCenterX ? "right" : "left"
    })()

    const portLabelX =
      resolvedPosition === "left"
        ? layoutBounds.minX - labelSideGap - labelWidth / 2
        : resolvedPosition === "right"
          ? layoutBounds.maxX + labelSideGap + labelWidth / 2
          : firstPoint.x
    const portLabelY =
      resolvedPosition === "top"
        ? layoutBounds.minY - labelOffset
        : resolvedPosition === "bottom"
          ? maxY + labelOffset
          : portLabelCenterY
    const labelBoxY = portLabelY - labelHeight / 2

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)"
    ctx.strokeStyle = lineColor
    ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
    drawRoundedRect(ctx, portLabelX - labelWidth / 2, labelBoxY, labelWidth, labelHeight, labelRadius)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#f8fafc"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(portLabel, portLabelX, portLabelY)

    // Draw line from port to first cabinet
    let lineStartX = portLabelX
    let lineStartY = portLabelY
    if (resolvedPosition === "left") {
      lineStartX = portLabelX + labelWidth / 2
    } else if (resolvedPosition === "right") {
      lineStartX = portLabelX - labelWidth / 2
    } else if (resolvedPosition === "top") {
      lineStartY = portLabelY + labelHeight / 2
    } else if (resolvedPosition === "bottom") {
      lineStartY = portLabelY - labelHeight / 2
    }
    ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
    ctx.lineWidth = outlineWidth
    ctx.beginPath()
    ctx.moveTo(lineStartX, lineStartY)
    ctx.lineTo(firstPoint.x, firstPoint.y)
    ctx.stroke()

    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(lineStartX, lineStartY)
    ctx.lineTo(firstPoint.x, firstPoint.y)
    ctx.stroke()

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
      ctx.lineWidth = outlineWidth
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

      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
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

      // Draw arrow at end when it won't overlap the receiver card
      const lastPoint = points[points.length - 1]
      const secondLast = points[points.length - 2]

      if (!lastPoint.hasReceiverCard) {
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
        ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
        ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
        ctx.stroke()
        ctx.fillStyle = lineColor
        ctx.fill()
      }
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
  dataRoutes: DataRoute[] | undefined,
  forcePortLabelsBottom: boolean,
) {
  const lineWidth = scaledWorldSize(5.5, zoom, 3, 9.5)
  const outlineWidth = lineWidth + scaledWorldSize(3, zoom, 2, 6)
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPadding = scaledWorldSize(9, zoom, 6, 13)
  const labelRadius = scaledWorldSize(7, zoom, 4.5, 11)
  const labelOffset = 140
  const labelSideGap = scaledWorldSize(110, zoom, 70, 160)
  const dataLabelSideGap = scaledWorldSize(60, zoom, 40, 90)
  const sideLabelGap = scaledWorldSize(12, zoom, 8, 18)
  const breakBarSize = scaledWorldSize(14, zoom, 10, 20)
  const breakStemSize = scaledWorldSize(10, zoom, 7, 16)
  const breakHeadSize = scaledWorldSize(12, zoom, 8, 18)

  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return
  const layoutMidY = (layoutBounds.minY + layoutBounds.maxY) / 2
  let maxPortLabelWidthLeft = 0
  let maxPortLabelWidthRight = 0
  const rowEdges = cabinets
    .map((cabinet) => getCabinetBounds(cabinet, cabinetTypes))
    .filter((bounds): bounds is NonNullable<ReturnType<typeof getCabinetBounds>> => !!bounds)
    .flatMap((bounds) => [bounds.y, bounds.y2])
    .sort((a, b) => a - b)
  const edgeTolerance = scaledWorldSize(8, zoom, 6, 12)
  const edgeOffset = scaledWorldSize(14, zoom, 10, 18)
  const nudgeAwayFromEdges = (y: number) => {
    if (rowEdges.length === 0) return y
    let nearest = rowEdges[0]
    let minDist = Math.abs(y - nearest)
    for (let i = 1; i < rowEdges.length; i++) {
      const dist = Math.abs(y - rowEdges[i])
      if (dist < minDist) {
        minDist = dist
        nearest = rowEdges[i]
      }
    }
    if (minDist > edgeTolerance) return y
    const direction = y === nearest ? (y >= layoutMidY ? 1 : -1) : Math.sign(y - nearest)
    return y + (direction || 1) * edgeOffset
  }

  if (dataRoutes && dataRoutes.length > 0) {
    const rowCenters: number[] = []
    const rowTolerance = 50
    cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const centerY = bounds.y + bounds.height / 2
      const existingRow = rowCenters.find((rowY) => Math.abs(rowY - centerY) < rowTolerance)
      if (!existingRow) rowCenters.push(centerY)
    })
    rowCenters.sort((a, b) => a - b)

    const dataFontSize = scaledWorldSize(14, zoom, 12, 18)
    const dataLabelPadding = scaledWorldSize(8, zoom, 6, 12)
    const dataLabelOffset = 90

    dataRoutes.forEach((route) => {
      if (route.cabinetIds.length === 0) return
      const firstEndpoint = route.cabinetIds.find((endpointId) => {
        const { cabinetId } = parseRouteCabinetId(endpointId)
        const cabinet = cabinets.find((c) => c.id === cabinetId)
        if (!cabinet) return false
        return getCabinetReceiverCardCount(cabinet) > 0
      })
      if (!firstEndpoint) return
      const { cabinetId, cardIndex } = parseRouteCabinetId(firstEndpoint)
      const cabinet = cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      if (cardCount === 0) return
      const rects = getReceiverCardRects(bounds, zoom, cardCount)
      const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
      const anchorRect = rects[resolvedIndex]
      const anchor = anchorRect
        ? { connectorX: anchorRect.connectorX, connectorY: anchorRect.connectorY }
        : { connectorX: bounds.x + bounds.width / 2, connectorY: bounds.y + bounds.height / 2 }

      const labelText = `Port ${route.port}`
      ctx.font = `bold ${dataFontSize}px Inter, sans-serif`
      const labelWidth = ctx.measureText(labelText).width + dataLabelPadding * 2
      const labelHeight = dataFontSize + dataLabelPadding * 1.6

      const resolvedPosition = (() => {
        if (route.labelPosition && route.labelPosition !== "auto") return route.labelPosition
        if (route.forcePortLabelBottom ?? forcePortLabelsBottom) return "bottom"
        let placeSide = false
        if (rowCenters.length > 1) {
          const centerY = bounds.y + bounds.height / 2
          let rowIndex = rowCenters.findIndex((rowY) => Math.abs(rowY - centerY) < rowTolerance)
          if (rowIndex === -1) {
            rowIndex = rowCenters.reduce((bestIndex, rowY, index) => {
              const bestDistance = Math.abs(rowCenters[bestIndex] - centerY)
              const distance = Math.abs(rowY - centerY)
              return distance < bestDistance ? index : bestIndex
            }, 0)
          }
          placeSide = rowIndex < rowCenters.length - 1
        }
        if (!placeSide) return "bottom"
        const layoutCenterX = (layoutBounds.minX + layoutBounds.maxX) / 2
        const firstCenterX = bounds.x + bounds.width / 2
        return firstCenterX >= layoutCenterX ? "right" : "left"
      })()

      if (resolvedPosition === "left" || resolvedPosition === "right") {
        if (resolvedPosition === "left") {
          maxPortLabelWidthLeft = Math.max(maxPortLabelWidthLeft, labelWidth)
        } else {
          maxPortLabelWidthRight = Math.max(maxPortLabelWidthRight, labelWidth)
        }
      } else if (resolvedPosition === "top" || resolvedPosition === "bottom") {
        const labelCenterY = resolvedPosition === "top" ? layoutBounds.minY - dataLabelOffset : layoutBounds.maxY + dataLabelOffset
        const labelCenterX = anchor.connectorX
        // No reservation for top/bottom yet.
        void labelCenterX
        void labelCenterY
      }
    })
  }

  powerFeeds.forEach((feed) => {
    if (feed.assignedCabinetIds.length === 0) return

    const isOverloaded = isPowerFeedOverloaded(feed, cabinets, cabinetTypes)
    const lineColor = isOverloaded ? "#ef4444" : "#f97316"

    ctx.save()
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const points: {
      x: number
      y: number
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>>
      cardRect?: ReceiverCardRect
    }[] = []
    feed.assignedCabinetIds.forEach((id) => {
      const cabinet = cabinets.find((c) => c.id === id)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, zoom, cardCount)
      let anchorX = bounds.x + bounds.width / 2
      let anchorY = bounds.y + bounds.height / 2
      let anchorRect: ReceiverCardRect | undefined
      if (rects.length > 0) {
        anchorRect = rects.length === 1 ? rects[0] : bounds.y + bounds.height / 2 > layoutMidY ? rects[1] : rects[0]
        const anchor = getPowerAnchorPoint(anchorRect, zoom)
        anchorX = anchor.x
        anchorY = anchor.y
      }
      points.push({
        x: anchorX,
        y: anchorY,
        bounds,
        cardRect: anchorRect,
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

    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    const loadW = getPowerFeedLoadW(feed, cabinets, cabinetTypes)
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.connector

    const maxTextWidth = Math.max(
      ctx.measureText(labelText).width,
      ctx.measureText(connectorText).width,
    )
    const boxWidth = maxTextWidth + labelPadding * 2
    const boxHeight = fontSize * 2.8 + labelPadding * 2
    const labelPosition = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : "bottom"
    const sideOffsetLeft =
      maxPortLabelWidthLeft > 0 ? dataLabelSideGap + maxPortLabelWidthLeft + sideLabelGap : labelSideGap
    const sideOffsetRight =
      maxPortLabelWidthRight > 0 ? dataLabelSideGap + maxPortLabelWidthRight + sideLabelGap : labelSideGap
    let labelCenterX =
      labelPosition === "left"
        ? layoutBounds.minX - sideOffsetLeft - boxWidth / 2
        : labelPosition === "right"
          ? layoutBounds.maxX + sideOffsetRight + boxWidth / 2
          : points[0].x
    const labelCenterY =
      labelPosition === "top"
        ? feedBounds.minY - labelOffset
        : labelPosition === "bottom"
          ? feedBounds.maxY + labelOffset
          : points[0].y
    const boxX = labelCenterX - boxWidth / 2
    const boxY = labelCenterY - boxHeight / 2

    // Background box
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)"
    ctx.strokeStyle = lineColor
    ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, labelRadius)
    ctx.fill()
    ctx.stroke()

    // Text
    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    ctx.fillText(labelText, labelCenterX, boxY + labelPadding)
    ctx.font = `${fontSize * 0.85}px Inter, sans-serif`
    ctx.fillText(connectorText, labelCenterX, boxY + labelPadding + fontSize * 1.1)

    // Draw line from breaker label to first cabinet
    let labelLineX = labelCenterX
    let labelLineY = labelCenterY
    if (labelPosition === "left") {
      labelLineX = labelCenterX + boxWidth / 2
    } else if (labelPosition === "right") {
      labelLineX = labelCenterX - boxWidth / 2
    } else if (labelPosition === "top") {
      labelLineY = labelCenterY + boxHeight / 2
    } else if (labelPosition === "bottom") {
      labelLineY = labelCenterY - boxHeight / 2
    }
    ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
    ctx.lineWidth = outlineWidth
    ctx.beginPath()
    ctx.moveTo(labelLineX, labelLineY)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()

    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(labelLineX, labelLineY)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      const rowGap = scaledWorldSize(30, zoom, 18, 30)
      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          const prevCard = prev.cardRect ?? getReceiverCardRect(prev.bounds, zoom)
          const currCard = curr.cardRect ?? getReceiverCardRect(curr.bounds, zoom)
          const rowCenterY = (prev.y + curr.y) / 2
          const isBottomRow = rowCenterY > (layoutBounds.minY + layoutBounds.maxY) / 2
          const liftY = isBottomRow
            ? Math.max(prevCard.y + prevCard.height, currCard.y + currCard.height) + rowGap
            : Math.min(prevCard.y, currCard.y) - rowGap
          ctx.lineTo(prev.x, liftY)
          ctx.lineTo(curr.x, liftY)
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else {
          const midY = nudgeAwayFromEdges((prev.y + curr.y) / 2)
          ctx.lineTo(prev.x, midY)
          ctx.lineTo(curr.x, midY)
          ctx.lineTo(curr.x, curr.y)
        }
      }
      ctx.stroke()

      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          const prevCard = prev.cardRect ?? getReceiverCardRect(prev.bounds, zoom)
          const currCard = curr.cardRect ?? getReceiverCardRect(curr.bounds, zoom)
          const rowCenterY = (prev.y + curr.y) / 2
          const isBottomRow = rowCenterY > (layoutBounds.minY + layoutBounds.maxY) / 2
          const liftY = isBottomRow
            ? Math.max(prevCard.y + prevCard.height, currCard.y + currCard.height) + rowGap
            : Math.min(prevCard.y, currCard.y) - rowGap
          ctx.lineTo(prev.x, liftY)
          ctx.lineTo(curr.x, liftY)
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else {
          const midY = nudgeAwayFromEdges((prev.y + curr.y) / 2)
          ctx.lineTo(prev.x, midY)
          ctx.lineTo(curr.x, midY)
          ctx.lineTo(curr.x, curr.y)
        }
      }
      ctx.stroke()
    }

    if (points.length > 0) {
      const lastPoint = points[points.length - 1]
      const secondLast =
        points.length > 1 ? points[points.length - 2] : { x: labelLineX, y: labelLineY }
      let angle: number
      if (Math.abs(lastPoint.x - secondLast.x) < 10) {
        angle = lastPoint.y > secondLast.y ? Math.PI / 2 : -Math.PI / 2
      } else {
        angle = lastPoint.x > secondLast.x ? 0 : Math.PI
      }

      const perp = angle + Math.PI / 2
      const stemEnd = {
        x: lastPoint.x + Math.cos(angle) * breakStemSize,
        y: lastPoint.y + Math.sin(angle) * breakStemSize,
      }
      const arrowTip = {
        x: stemEnd.x + Math.cos(angle) * breakHeadSize,
        y: stemEnd.y + Math.sin(angle) * breakHeadSize,
      }
      const arrowHalf = breakHeadSize * 0.55
      const arrowLeft = {
        x: stemEnd.x + Math.cos(perp) * arrowHalf,
        y: stemEnd.y + Math.sin(perp) * arrowHalf,
      }
      const arrowRight = {
        x: stemEnd.x - Math.cos(perp) * arrowHalf,
        y: stemEnd.y - Math.sin(perp) * arrowHalf,
      }
      const barHalf = breakBarSize / 2
      const barStart = {
        x: arrowTip.x + Math.cos(perp) * barHalf,
        y: arrowTip.y + Math.sin(perp) * barHalf,
      }
      const barEnd = {
        x: arrowTip.x - Math.cos(perp) * barHalf,
        y: arrowTip.y - Math.sin(perp) * barHalf,
      }

      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.moveTo(lastPoint.x, lastPoint.y)
      ctx.lineTo(stemEnd.x, stemEnd.y)
      ctx.stroke()

      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(lastPoint.x, lastPoint.y)
      ctx.lineTo(stemEnd.x, stemEnd.y)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(arrowTip.x, arrowTip.y)
      ctx.lineTo(arrowLeft.x, arrowLeft.y)
      ctx.lineTo(arrowRight.x, arrowRight.y)
      ctx.closePath()
      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
      ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
      ctx.stroke()
      ctx.fillStyle = lineColor
      ctx.fill()

      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)"
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.moveTo(barStart.x, barStart.y)
      ctx.lineTo(barEnd.x, barEnd.y)
      ctx.stroke()

      ctx.strokeStyle = lineColor
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(barStart.x, barStart.y)
      ctx.lineTo(barEnd.x, barEnd.y)
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
  minY?: number,
) {
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { minX, maxX, maxY } = layoutBounds

  const numPorts = controller === "A100" ? 2 : 4
  const boxWidth = Math.max(100, 120 / zoom)
  const boxHeight = Math.max(35, 40 / zoom)
  const fontSize = Math.max(10, 11 / zoom)

  const boxX = (minX + maxX) / 2 - boxWidth / 2
  const baseY = maxY + scaledWorldSize(100, zoom, 70, 160)
  const boxY = Math.max(baseY, minY ?? baseY)

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
  const { layout, zoom, panX, panY, selectedCabinetId, selectedCabinetIds, showDimensions, routingMode } = state

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })
  const isDraggingCabinetRef = useRef(false)
  const draggingCabinetIdRef = useRef<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartWorldRef = useRef({ x: 0, y: 0 })
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [selectionBox, setSelectionBox] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
    additive: boolean
  } | null>(null)

  const errors = validateLayout(layout)
  const errorCabinetIds = new Set(errors.filter((e) => e.type === "error").flatMap((e) => e.cabinetIds))

  const activeCabinetIds = new Set<string>()
  if (routingMode.type === "data") {
    const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
    route?.cabinetIds.forEach((endpointId) => {
      const { cabinetId } = parseRouteCabinetId(endpointId)
      activeCabinetIds.add(cabinetId)
    })
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

  const handleWheelZoom = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const delta = deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(5, zoom * delta))

      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const mouseX = clientX - rect.left
        const mouseY = clientY - rect.top
        const worldX = (mouseX - panX) / zoom
        const worldY = (mouseY - panY) / zoom
        const newPanX = mouseX - worldX * newZoom
        const newPanY = mouseY - worldY * newZoom

        dispatch({ type: "SET_ZOOM", payload: newZoom })
        dispatch({ type: "SET_PAN", payload: { x: newPanX, y: newPanY } })
      }
    },
    [dispatch, panX, panY, zoom],
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
    const showCabinetLabels = overview?.showCabinetLabels ?? true
    const showReceiverCards = overview?.showReceiverCards ?? true
    const receiverCardModel = overview?.receiverCardModel || "5A75-E"
    const showDataRoutes = overview?.showDataRoutes ?? true
    const showPowerRoutes = overview?.showPowerRoutes ?? true
    const showModuleGrid = overview?.showModuleGrid ?? true
    const forcePortLabelsBottom = overview?.forcePortLabelsBottom ?? false
    const moduleSize = overview?.moduleSize || "320x160"
    const moduleOrientation = overview?.moduleOrientation || "portrait"
    const baseModule = moduleSize === "160x160" ? { width: 160, height: 160 } : { width: 320, height: 160 }
    const moduleWidth = moduleOrientation === "portrait" ? baseModule.height : baseModule.width
    const moduleHeight = moduleOrientation === "portrait" ? baseModule.width : baseModule.height
    const moduleGridBounds = showModuleGrid
      ? getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
      : null
    const moduleGridOrigin = moduleGridBounds ? { x: moduleGridBounds.minX, y: moduleGridBounds.minY } : null
    const routeBadges: { x: number; y: number; size: number; label: string }[] = []

    // Draw cabinets
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return

    const isSelected = selectedCabinetIds.includes(cabinet.id)
      const hasError = errorCabinetIds.has(cabinet.id)
      const isInActiveRoute = activeCabinetIds.has(cabinet.id)

      let fillStart = "rgba(44, 86, 120, 0.85)"
      let fillEnd = "rgba(30, 56, 78, 0.9)"
      let strokeColor = "#5aa9c6"

      if (hasError) {
        fillStart = "rgba(190, 50, 50, 0.6)"
        fillEnd = "rgba(120, 30, 30, 0.65)"
        strokeColor = "#dc2626"
      } else if (isSelected) {
        fillStart = "rgba(92, 150, 210, 0.6)"
        fillEnd = "rgba(60, 110, 170, 0.55)"
        strokeColor = "#38bdf8"
      } else if (isInActiveRoute) {
        if (routingMode.type === "data") {
          fillStart = "rgba(72, 140, 210, 0.5)"
          fillEnd = "rgba(44, 100, 170, 0.55)"
          strokeColor = "#7fb9ef"
        } else if (routingMode.type === "power") {
          fillStart = "rgba(210, 120, 54, 0.45)"
          fillEnd = "rgba(150, 90, 40, 0.5)"
          strokeColor = "#fbbf83"
        }
      }

      const fillGradient = ctx.createLinearGradient(
        bounds.x,
        bounds.y,
        bounds.x + bounds.width,
        bounds.y + bounds.height,
      )
      fillGradient.addColorStop(0, fillStart)
      fillGradient.addColorStop(1, fillEnd)

      ctx.fillStyle = fillGradient
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)

      if (showModuleGrid && moduleWidth > 0 && moduleHeight > 0 && moduleGridOrigin) {
        ctx.save()
        const inset = 1 / zoom
        ctx.beginPath()
        ctx.rect(bounds.x + inset, bounds.y + inset, bounds.width - inset * 2, bounds.height - inset * 2)
        ctx.clip()
        ctx.strokeStyle = "rgba(148, 163, 184, 0.22)"
        ctx.lineWidth = Math.max(0.8 / zoom, 0.6 / zoom)
        ctx.beginPath()
        let startX = moduleGridOrigin.x + Math.ceil((bounds.x - moduleGridOrigin.x) / moduleWidth) * moduleWidth
        if (startX <= bounds.x + 1e-6) startX += moduleWidth
        for (let x = startX; x < bounds.x + bounds.width - inset; x += moduleWidth) {
          ctx.moveTo(x, bounds.y + inset)
          ctx.lineTo(x, bounds.y + bounds.height - inset)
        }
        let startY = moduleGridOrigin.y + Math.ceil((bounds.y - moduleGridOrigin.y) / moduleHeight) * moduleHeight
        if (startY <= bounds.y + 1e-6) startY += moduleHeight
        for (let y = startY; y < bounds.y + bounds.height - inset; y += moduleHeight) {
          ctx.moveTo(bounds.x + inset, y)
          ctx.lineTo(bounds.x + bounds.width - inset, y)
        }
        ctx.stroke()
        ctx.restore()
      }

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = isSelected || isInActiveRoute ? 3 / zoom : 2.5 / zoom
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

      if (showCabinetLabels) {
        if (labelsMode === "grid") {
          const displayLabel = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes)
          drawGridLabel(ctx, bounds, displayLabel, zoom)
        } else {
          const fontSize = Math.max(12, 14 / zoom)
          ctx.fillStyle = "#e2e8f0"
          ctx.font = `${fontSize}px Inter, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(cabinet.id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)
        }
      }

      ctx.fillStyle = "#64748b"
      const smallFontSize = Math.max(8, 9 / zoom)
      ctx.font = `${smallFontSize}px Inter, sans-serif`
      ctx.textAlign = "right"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(
        cabinet.typeId.replace("STD_", ""),
        bounds.x + bounds.width - 6 / zoom,
        bounds.y + bounds.height - 6 / zoom,
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
          const cardCount = getCabinetReceiverCardCount(cabinet)
          const rects = getReceiverCardRects(bounds, zoom, cardCount)
          if (rects.length === 0) return
          route.cabinetIds.forEach((endpointId, index) => {
            const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
            if (cabinetId !== cabinet.id) return
            const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
            const anchorRect = rects[resolvedIndex]
            const badgeSize = 18 / zoom
            const badgeX = anchorRect ? anchorRect.x + anchorRect.width - badgeSize * 0.6 : bounds.x + bounds.width - badgeSize
            const badgeY = anchorRect ? anchorRect.y + badgeSize * 0.1 : bounds.y + bounds.height - badgeSize
            routeBadges.push({
              x: badgeX + badgeSize / 2,
              y: badgeY + badgeSize / 2,
              size: badgeSize,
              label: `${index + 1}`,
            })
          })
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
        forcePortLabelsBottom,
        layout.project.pitch_mm,
      )
    }

    // Draw power feeds above data routes
    if (showPowerRoutes && powerFeeds && powerFeeds.length > 0) {
      drawPowerFeeds(
        ctx,
        powerFeeds,
        layout.cabinets,
        layout.cabinetTypes,
        zoom,
        dataRoutes,
        forcePortLabelsBottom,
      )
    }

    // Draw receiver cards on top so data lines sit underneath the label
    if (showReceiverCards) {
      layout.cabinets.forEach((cabinet) => {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (!bounds) return
        const cardCount = getCabinetReceiverCardCount(cabinet)
        if (cardCount === 0) return
        const cardModel =
          cabinet.receiverCardOverride === null ? null : cabinet.receiverCardOverride || receiverCardModel
        if (!cardModel) return
        const rects = getReceiverCardRects(bounds, zoom, cardCount)
        rects.forEach((rect) => {
          drawReceiverCard(ctx, rect, cardModel, zoom)
          drawPowerAnchorDot(ctx, rect, zoom)
        })
      })
    }

    if (routeBadges.length > 0) {
      const fontSize = Math.max(9, 10 / zoom)
      ctx.save()
      ctx.fillStyle = "#3b82f6"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `bold ${fontSize}px Inter, sans-serif`
      routeBadges.forEach((badge) => {
        ctx.beginPath()
        ctx.arc(badge.x, badge.y, badge.size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#ffffff"
        ctx.fillText(badge.label, badge.x, badge.y)
        ctx.fillStyle = "#3b82f6"
      })
      ctx.restore()
    }

    // Draw controller
    if (layout.cabinets.length > 0) {
      const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
      if (layoutBounds) {
        const rowCenters: number[] = []
        const rowTolerance = 50
        layout.cabinets.forEach((cabinet) => {
          const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
          if (!bounds) return
          const centerY = bounds.y + bounds.height / 2
          const existingRow = rowCenters.find((rowY) => Math.abs(rowY - centerY) < rowTolerance)
          if (!existingRow) rowCenters.push(centerY)
        })
        rowCenters.sort((a, b) => a - b)

        let dataPortBottom: number | null = null
        if (showDataRoutes && dataRoutes && dataRoutes.length > 0) {
          const fontSize = scaledWorldSize(14, zoom, 12, 18)
          const labelPadding = scaledWorldSize(8, zoom, 6, 12)
          const labelHeight = fontSize + labelPadding * 1.6
          const labelOffset = 90

          for (const route of dataRoutes) {
            const firstEndpoint = route.cabinetIds.find((endpointId) => {
              const { cabinetId } = parseRouteCabinetId(endpointId)
              const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
              if (!cabinet) return false
              return getCabinetReceiverCardCount(cabinet) > 0
            })
            if (!firstEndpoint) continue

            const { cabinetId } = parseRouteCabinetId(firstEndpoint)
            const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
            if (!cabinet) continue
            const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
            if (!bounds) continue

            const forceBottom = route.forcePortLabelBottom ?? forcePortLabelsBottom
            const explicitPosition =
              route.labelPosition && route.labelPosition !== "auto" ? route.labelPosition : null
            let resolvedPosition: "bottom" | "side" | "top" | "left" | "right"
            if (explicitPosition) {
              resolvedPosition = explicitPosition
            } else if (forceBottom) {
              resolvedPosition = "bottom"
            } else {
              let placeLeft = false
              if (rowCenters.length > 1) {
                const centerY = bounds.y + bounds.height / 2
                let rowIndex = rowCenters.findIndex((rowY) => Math.abs(rowY - centerY) < rowTolerance)
                if (rowIndex === -1) {
                  rowIndex = rowCenters.reduce((bestIndex, rowY, index) => {
                    const bestDistance = Math.abs(rowCenters[bestIndex] - centerY)
                    const distance = Math.abs(rowY - centerY)
                    return distance < bestDistance ? index : bestIndex
                  }, 0)
                }
                placeLeft = rowIndex < rowCenters.length - 1
              }
              resolvedPosition = placeLeft ? "side" : "bottom"
            }

            if (resolvedPosition === "bottom") {
              dataPortBottom = layoutBounds.maxY + labelOffset + labelHeight / 2
              break
            }
          }
        }

        let powerLabelBottom: number | null = null
        if (showPowerRoutes && powerFeeds && powerFeeds.length > 0) {
          const fontSize = scaledWorldSize(14, zoom, 12, 18)
          const labelPadding = scaledWorldSize(9, zoom, 6, 13)
          const labelOffset = 140
          const boxHeight = fontSize * 2.8 + labelPadding * 2

          powerFeeds.forEach((feed) => {
            if (feed.assignedCabinetIds.length === 0) return
            const labelPosition = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : "bottom"
            if (labelPosition !== "bottom") return
            const feedBounds = getLayoutBoundsFromCabinets(
              layout.cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
              layout.cabinetTypes,
            )
            if (!feedBounds) return
            const labelY = feedBounds.maxY + labelOffset
            const bottom = labelY + boxHeight
            powerLabelBottom = powerLabelBottom === null ? bottom : Math.max(powerLabelBottom, bottom)
          })
        }

        const clearance = scaledWorldSize(24, zoom, 16, 40)
        const controllerMinY = Math.max(
          layoutBounds.maxY + scaledWorldSize(120, zoom, 80, 200),
          (dataPortBottom ?? -Infinity) + clearance,
          (powerLabelBottom ?? -Infinity) + clearance,
        )
        drawControllerPorts(ctx, controller, layout.cabinets, layout.cabinetTypes, zoom, controllerMinY)
      }
    }

    if (showDimensions && layout.cabinets.length > 0) {
      const showPixels = overview?.showPixels ?? true
      drawOverallDimensions(ctx, layout.cabinets, layout.cabinetTypes, zoom, layout.project.pitch_mm, showPixels)
    }

    if (selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x)
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x)
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y)
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y)
      ctx.save()
      ctx.fillStyle = "rgba(56, 189, 248, 0.12)"
      ctx.strokeStyle = "rgba(56, 189, 248, 0.9)"
      ctx.lineWidth = 1 / zoom
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      ctx.restore()
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
  }, [
    layout,
    zoom,
    panX,
    panY,
    selectedCabinetId,
    selectedCabinetIds,
    selectionBox,
    errorCabinetIds,
    showDimensions,
    routingMode,
    activeCabinetIds,
  ])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      handleWheelZoom(event.deltaY, event.clientX, event.clientY)
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [handleWheelZoom])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (routingMode.type !== "none") {
        dispatch({ type: "SET_ROUTING_MODE", payload: { type: "none" } })
        dispatch({ type: "PUSH_HISTORY" })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [routingMode, dispatch])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return
    const world = screenToWorld(e.clientX, e.clientY)
    const cabinet = findCabinetAt(world.x, world.y)
    const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (cabinet) {
      if (routingMode.type === "data") {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        const cardCount = getCabinetReceiverCardCount(cabinet)
        if (!bounds || cardCount === 0) return
        const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
        const cardIndex = getReceiverCardIndexAtPoint(bounds, zoom, cardCount, world.x, world.y)
        const existingEndpoint =
          cardCount === 1 ? route?.cabinetIds.find((id) => parseRouteCabinetId(id).cabinetId === cabinet.id) : undefined
        const endpointId =
          cardCount === 1
            ? existingEndpoint ?? cabinet.id
            : formatRouteCabinetId(cabinet.id, cardIndex ?? undefined)
        dispatch({
          type: "ADD_CABINET_TO_ROUTE",
          payload: { routeId: routingMode.routeId, endpointId },
        })
      } else if (routingMode.type === "power") {
        dispatch({
          type: "ADD_CABINET_TO_POWER_FEED",
          payload: { feedId: routingMode.feedId, cabinetId: cabinet.id },
        })
      } else if (isMultiSelect) {
        dispatch({ type: "TOGGLE_CABINET_SELECTION", payload: cabinet.id })
      } else {
        // Normal selection/drag
        if (!selectedCabinetIds.includes(cabinet.id)) {
          dispatch({ type: "SELECT_CABINET", payload: cabinet.id })
        }

        const dragIds = selectedCabinetIds.includes(cabinet.id) ? selectedCabinetIds : [cabinet.id]
        const positions = new Map<string, { x: number; y: number }>()
        dragIds.forEach((id) => {
          const target = layout.cabinets.find((c) => c.id === id)
          if (!target) return
          positions.set(id, { x: target.x_mm, y: target.y_mm })
        })
        dragStartPositionsRef.current = positions
        dragStartWorldRef.current = { x: world.x, y: world.y }

        isDraggingCabinetRef.current = true
        draggingCabinetIdRef.current = cabinet.id
        dragOffsetRef.current = {
          x: world.x - cabinet.x_mm,
          y: world.y - cabinet.y_mm,
        }
      }
    } else {
      if (routingMode.type === "none" && e.button === 0 && !e.altKey) {
        setSelectionBox({ start: world, end: world, additive: isMultiSelect })
      } else {
        dispatch({ type: "SELECT_CABINET", payload: null })
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (selectionBox) {
      const world = screenToWorld(e.clientX, e.clientY)
      setSelectionBox((prev) => (prev ? { ...prev, end: world } : prev))
    } else if (isPanning) {
      const dx = e.clientX - lastPanPos.x
      const dy = e.clientY - lastPanPos.y
      dispatch({ type: "SET_PAN", payload: { x: panX + dx, y: panY + dy } })
      setLastPanPos({ x: e.clientX, y: e.clientY })
    } else if (isDraggingCabinetRef.current && draggingCabinetIdRef.current && routingMode.type === "none") {
      const world = screenToWorld(e.clientX, e.clientY)
      const dragIds = Array.from(dragStartPositionsRef.current.keys())
      if (dragIds.length <= 1) {
        const snapped = snapToGrid(world.x - dragOffsetRef.current.x, world.y - dragOffsetRef.current.y)
        dispatch({
          type: "UPDATE_CABINET",
          payload: {
            id: draggingCabinetIdRef.current,
            updates: { x_mm: snapped.x, y_mm: snapped.y },
          },
        })
      } else {
        const primaryId = draggingCabinetIdRef.current
        const primaryStart = dragStartPositionsRef.current.get(primaryId)
        if (!primaryStart) return
        const dx = world.x - dragStartWorldRef.current.x
        const dy = world.y - dragStartWorldRef.current.y
        const desired = snapToGrid(primaryStart.x + dx, primaryStart.y + dy)
        const snappedDx = desired.x - primaryStart.x
        const snappedDy = desired.y - primaryStart.y

        dragStartPositionsRef.current.forEach((pos, id) => {
          dispatch({
            type: "UPDATE_CABINET",
            payload: {
              id,
              updates: { x_mm: pos.x + snappedDx, y_mm: pos.y + snappedDy },
            },
          })
        })
      }
    }
  }

  const handleMouseUp = () => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.end.x)
      const maxX = Math.max(selectionBox.start.x, selectionBox.end.x)
      const minY = Math.min(selectionBox.start.y, selectionBox.end.y)
      const maxY = Math.max(selectionBox.start.y, selectionBox.end.y)
      const hits = layout.cabinets
        .map((cabinet) => {
          const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
          if (!bounds) return null
          const intersects =
            bounds.x <= maxX && bounds.x2 >= minX && bounds.y <= maxY && bounds.y2 >= minY
          return intersects ? cabinet.id : null
        })
        .filter((id): id is string => !!id)

      const nextSelection = selectionBox.additive
        ? Array.from(new Set([...selectedCabinetIds, ...hits]))
        : hits
      dispatch({ type: "SET_CABINET_SELECTION", payload: nextSelection })
      setSelectionBox(null)
    }
    if (isDraggingCabinetRef.current) {
      dispatch({ type: "PUSH_HISTORY" })
    }
    setIsPanning(false)
    isDraggingCabinetRef.current = false
    draggingCabinetIdRef.current = null
    dragStartPositionsRef.current = new Map()
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
    <div ref={containerRef} className="flex-1 relative bg-[#0f0f0f] overflow-hidden overscroll-none touch-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
