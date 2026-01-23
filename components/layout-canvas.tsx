"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, validateLayout } from "@/lib/validation"
import type { Cabinet, CabinetType, DataRoute, DataRouteStep, PowerFeed } from "@/lib/types"
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

function getReceiverCardRect(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  heightFraction = 0.28,
): ReceiverCardRect {
  const maxWidth = Math.min(84 / zoom, bounds.width * 0.65)
  const minWidth = Math.min(40 / zoom, maxWidth)
  const maxHeight = Math.min(18 / zoom, bounds.height * heightFraction)
  const minHeight = Math.min(12 / zoom, maxHeight)
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
  const heightFraction = count === 2 ? 0.2 : 0.26
  const base = getReceiverCardRect(bounds, zoom, heightFraction)
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

function snapToIncrement(value: number, stepMm?: number) {
  if (!stepMm || stepMm <= 0) return value
  return Math.round(value / stepMm) * stepMm
}

function getRouteSnapStepMm(stepMm?: number) {
  if (!stepMm || stepMm <= 0) return undefined
  return Math.max(10, Math.min(80, stepMm / 4))
}

function getRouteSteps(route: DataRoute): DataRouteStep[] {
  if (route.manualMode && route.steps && route.steps.length > 0) return route.steps
  return route.cabinetIds.map((endpointId) => ({ type: "cabinet", endpointId }))
}

function getRouteCabinetIdsFromSteps(steps: DataRouteStep[]): string[] {
  return steps.flatMap((step) => (step.type === "cabinet" ? [step.endpointId] : []))
}

function getPowerSteps(feed: PowerFeed): DataRouteStep[] {
  if (feed.manualMode && feed.steps && feed.steps.length > 0) return feed.steps
  return feed.assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
}

function getPowerCabinetIdsFromSteps(steps: DataRouteStep[]): string[] {
  return steps.flatMap((step) => (step.type === "cabinet" ? [step.endpointId] : []))
}

function findManualStepIndex(
  steps: DataRouteStep[] | undefined,
  world: { x: number; y: number },
  zoom: number,
): number | null {
  if (!steps || steps.length === 0) return null
  const hitRadius = 10 / zoom
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type !== "point") continue
    const dx = step.x_mm - world.x
    const dy = step.y_mm - world.y
    if (Math.hypot(dx, dy) <= hitRadius) return i
  }
  return null
}

function getRouteStepPosition(
  step: DataRouteStep,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
): { x: number; y: number } | null {
  if (step.type === "point") return { x: step.x_mm, y: step.y_mm }
  const { cabinetId, cardIndex } = parseRouteCabinetId(step.endpointId)
  const cabinet = cabinets.find((c) => c.id === cabinetId)
  if (!cabinet) return null
  const bounds = getCabinetBounds(cabinet, cabinetTypes)
  if (!bounds) return null
  const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex)
  return { x: anchor.x, y: anchor.y }
}

function getPowerStepPosition(
  step: DataRouteStep,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
): { x: number; y: number } | null {
  if (step.type === "point") return { x: step.x_mm, y: step.y_mm }
  const cabinet = cabinets.find((c) => c.id === step.endpointId)
  if (!cabinet) return null
  const bounds = getCabinetBounds(cabinet, cabinetTypes)
  if (!bounds) return null
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  const layoutMidY = layoutBounds ? (layoutBounds.minY + layoutBounds.maxY) / 2 : bounds.y + bounds.height / 2
  const cardCount = getCabinetReceiverCardCount(cabinet)
  const rects = getReceiverCardRects(bounds, zoom, cardCount)
  if (rects.length === 0) {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  }
  const anchorRect =
    rects.length === 1 ? rects[0] : bounds.y + bounds.height / 2 > layoutMidY ? rects[1] : rects[0]
  const anchor = getPowerAnchorPoint(anchorRect, bounds, zoom)
  return { x: anchor.x, y: anchor.y }
}

function getOrthogonalPoint(
  target: { x: number; y: number },
  reference: { x: number; y: number } | null,
  stepMm?: number,
) {
  if (!reference) {
    return {
      x: snapToIncrement(target.x, stepMm),
      y: snapToIncrement(target.y, stepMm),
    }
  }
  const dx = target.x - reference.x
  const dy = target.y - reference.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: snapToIncrement(target.x, stepMm),
      y: reference.y,
    }
  }
  return {
    x: reference.x,
    y: snapToIncrement(target.y, stepMm),
  }
}

function getCabinetDataAnchorPoint(
  cabinet: Cabinet,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  cardIndex?: number,
): { x: number; y: number; resolvedIndex?: number; cardCount: 0 | 1 | 2; isVirtual: boolean } {
  const cardCount = getCabinetReceiverCardCount(cabinet)
  if (cardCount > 0) {
    const rects = getReceiverCardRects(bounds, zoom, cardCount)
    const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
    const anchorRect = rects[resolvedIndex]
    if (anchorRect) {
      return {
        x: anchorRect.connectorX,
        y: anchorRect.connectorY,
        resolvedIndex,
        cardCount,
        isVirtual: false,
      }
    }
  }

  const override = cabinet.dataAnchorOverride
  const anchorX = bounds.x + bounds.width * clamp(override?.x ?? 0.5, 0, 1)
  const anchorY = bounds.y + bounds.height * clamp(override?.y ?? 0.5, 0, 1)
  return {
    x: anchorX,
    y: anchorY,
    cardCount,
    isVirtual: cardCount === 0,
  }
}

function scaledWorldSize(basePx: number, zoom: number, minPx: number, maxPx: number) {
  const sizePx = clamp(basePx * zoom, minPx, maxPx)
  return sizePx / zoom
}

function getPowerAnchorPoint(
  cardRect: ReceiverCardRect,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  const margin = Math.min(8 / zoom, bounds.width * 0.04)
  const offset = Math.min(6 / zoom, cardRect.width * 0.25)
  const anchorX = Math.max(bounds.x + margin, cardRect.x - offset)
  return { x: anchorX, y: cardRect.centerY }
}

function drawPowerAnchorDot(
  ctx: CanvasRenderingContext2D,
  cardRect: ReceiverCardRect,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  const { x, y } = getPowerAnchorPoint(cardRect, bounds, zoom)
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
  const baseFontSize = Math.min(8 / zoom, height * 0.75)
  const minFontSize = 5 / zoom
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

  const maxTextWidth = width - padding * 2
  let fontSize = baseFontSize
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  const textWidth = ctx.measureText(model).width
  if (textWidth > maxTextWidth && textWidth > 0) {
    fontSize = Math.max(minFontSize, fontSize * (maxTextWidth / textWidth))
  }

  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const fitted = fitTextToWidth(ctx, model, maxTextWidth)
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

function drawControllerBadge(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  label: string,
  zoom: number,
) {
  const fontSize = Math.max(9, 10 / zoom)
  const paddingX = 6 / zoom
  const paddingY = 3 / zoom
  const inset = 6 / zoom

  ctx.save()
  ctx.font = `bold ${fontSize}px Inter, sans-serif`
  const textWidth = ctx.measureText(label).width
  const boxWidth = textWidth + paddingX * 2
  const boxHeight = fontSize + paddingY * 2
  const boxX = bounds.x + bounds.width - boxWidth - inset
  const boxY = bounds.y + inset

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)"
  ctx.strokeStyle = "#38bdf8"
  ctx.lineWidth = Math.max(0.9 / zoom, 0.6 / zoom)
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 4 / zoom)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = "#e2e8f0"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2)
  ctx.restore()
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
  activeRouteId?: string,
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
    const hasManualSteps = !!route.manualMode && !!route.steps && route.steps.length > 0
    if (route.cabinetIds.length === 0 && !hasManualSteps) return
    const routeSteps = getRouteSteps(route)
    const useManualSteps = route.manualMode && route.steps && route.steps.length > 0

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
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>> | null
      hasReceiverCard: boolean
      cardIndex?: number
      isVirtualAnchor: boolean
    }[] = []
    const virtualAnchors: { x: number; y: number }[] = []
    const manualPoints: { x: number; y: number }[] = []
    routeSteps.forEach((step) => {
      if (step.type === "point") {
        points.push({
          x: step.x_mm,
          y: step.y_mm,
          bounds: null,
          hasReceiverCard: false,
          isVirtualAnchor: false,
        })
        manualPoints.push({ x: step.x_mm, y: step.y_mm })
        return
      }
      const { cabinetId, cardIndex } = parseRouteCabinetId(step.endpointId)
      const cabinet = cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex)
      const hasReceiverCard =
        anchor.cardCount > 0 &&
        showReceiverCards &&
        (cabinet.receiverCardOverride === null ? false : !!(cabinet.receiverCardOverride || receiverCardModel))
      points.push({
        x: anchor.x,
        y: anchor.y,
        bounds,
        hasReceiverCard,
        cardIndex: anchor.resolvedIndex,
        isVirtualAnchor: anchor.isVirtual,
      })
      if (anchor.isVirtual) {
        virtualAnchors.push({ x: anchor.x, y: anchor.y })
      }
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
      const routeMinY = Math.min(...points.map((point) => point.y))
      const routeMaxY = Math.max(...points.map((point) => point.y))
      const drawRouteConnections = (strokeStyle: string, width: number) => {
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        let lastVerticalDir: number | null = null

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          const dirY = Math.sign(dy) || 0

          if (absDx < 10 && absDy < 10) {
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (absDx < 10) {
            if (!useManualSteps && lastVerticalDir !== null && dirY !== 0 && dirY !== lastVerticalDir) {
              const turnY = dirY > 0 ? routeMinY : routeMaxY
              ctx.lineTo(prev.x, turnY)
              ctx.lineTo(curr.x, turnY)
              ctx.lineTo(curr.x, curr.y)
            } else {
              ctx.lineTo(curr.x, curr.y)
            }
            if (dirY !== 0) lastVerticalDir = dirY
            continue
          }

          if (absDy < 10) {
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (!useManualSteps && lastVerticalDir !== null && dirY !== 0 && dirY !== lastVerticalDir) {
            const turnY = dirY > 0 ? routeMinY : routeMaxY
            ctx.lineTo(prev.x, turnY)
            ctx.lineTo(curr.x, turnY)
            ctx.lineTo(curr.x, curr.y)
          } else {
            // Turn at the destination point to avoid mid-span backtracking.
            ctx.lineTo(prev.x, curr.y)
            ctx.lineTo(curr.x, curr.y)
          }
          if (dirY !== 0) lastVerticalDir = dirY
        }
        ctx.stroke()
      }

      drawRouteConnections("rgba(2, 6, 23, 0.9)", outlineWidth)
      drawRouteConnections(lineColor, lineWidth)

      // Draw end cap when it won't overlap the receiver card
      const lastPoint = points[points.length - 1]
      const secondLast = points[points.length - 2]

      if (!lastPoint.hasReceiverCard) {
        const endSize = Math.max(3.2 / zoom, arrowSize * 0.35)
        ctx.beginPath()
        ctx.arc(lastPoint.x, lastPoint.y, endSize, 0, Math.PI * 2)
        ctx.fillStyle = lineColor
        ctx.fill()
      }
    }

    if (virtualAnchors.length > 0) {
      ctx.save()
      ctx.fillStyle = "#3b82f6"
      virtualAnchors.forEach((anchor) => {
        ctx.beginPath()
        ctx.arc(anchor.x, anchor.y, 3.2 / zoom, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.restore()
    }

    if (route.manualMode && route.id === activeRouteId && manualPoints.length > 0) {
      const handleRadius = 6 / zoom
      ctx.save()
      ctx.fillStyle = "#ffffff"
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = Math.max(1 / zoom, 0.8 / zoom)
      manualPoints.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
      ctx.restore()
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
  activeFeedId?: string,
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
  let maxPortLabelBottom: number | null = null

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

    let hasBottomLabel = false
    dataRoutes.forEach((route) => {
      if (route.cabinetIds.length === 0) return
      const firstEndpoint = route.cabinetIds.find((endpointId) => {
        const { cabinetId } = parseRouteCabinetId(endpointId)
        const cabinet = cabinets.find((c) => c.id === cabinetId)
        if (!cabinet) return false
        return !!getCabinetBounds(cabinet, cabinetTypes)
      })
      if (!firstEndpoint) return
      const { cabinetId, cardIndex } = parseRouteCabinetId(firstEndpoint)
      const cabinet = cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return
      const anchorPoint = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex)
      const anchor = { connectorX: anchorPoint.x, connectorY: anchorPoint.y }

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
      if (resolvedPosition === "bottom") {
        hasBottomLabel = true
      }
    })
    if (hasBottomLabel) {
      const dataLabelHeight = dataFontSize + dataLabelPadding * 1.6
      maxPortLabelBottom = layoutBounds.maxY + dataLabelOffset + dataLabelHeight / 2
    }
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

    const feedSteps = getPowerSteps(feed)
    const useManualSteps = feed.manualMode && feed.steps && feed.steps.length > 0
    const points: {
      x: number
      y: number
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>> | null
      cardRect?: ReceiverCardRect
    }[] = []
    const manualPoints: { x: number; y: number }[] = []
    feedSteps.forEach((step) => {
      if (step.type === "point") {
        points.push({ x: step.x_mm, y: step.y_mm, bounds: null })
        manualPoints.push({ x: step.x_mm, y: step.y_mm })
        return
      }
      const cabinet = cabinets.find((c) => c.id === step.endpointId)
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
        const anchor = getPowerAnchorPoint(anchorRect, bounds, zoom)
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
    let labelCenterY: number
    if (labelPosition === "bottom") {
      let labelTop = feedBounds.maxY + labelOffset
      if (maxPortLabelBottom !== null) {
        const minLabelTop = maxPortLabelBottom + scaledWorldSize(16, zoom, 10, 22)
        labelTop = Math.max(labelTop, minLabelTop)
      }
      labelCenterY = labelTop + boxHeight / 2
    } else if (labelPosition === "top") {
      labelCenterY = feedBounds.minY - labelOffset
    } else {
      labelCenterY = points[0].y
    }
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
      const feedMinY = Math.min(...points.map((point) => point.y))
      const feedMaxY = Math.max(...points.map((point) => point.y))
      const drawFeedConnections = (strokeStyle: string, width: number) => {
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        let lastVerticalDir: number | null = null

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          const dirY = Math.sign(dy) || 0

          if (useManualSteps) {
            if (absDx < 10 || absDy < 10) {
              ctx.lineTo(curr.x, curr.y)
              continue
            }
            ctx.lineTo(prev.x, curr.y)
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (absDy < 10 && prev.bounds && curr.bounds) {
            const prevCard = prev.cardRect ?? getReceiverCardRect(prev.bounds, zoom, 0.35)
            const currCard = curr.cardRect ?? getReceiverCardRect(curr.bounds, zoom, 0.35)
            const rowCenterY = (prev.y + curr.y) / 2
            const isBottomRow = rowCenterY > (layoutBounds.minY + layoutBounds.maxY) / 2
            const liftY = isBottomRow
              ? Math.max(prevCard.y + prevCard.height, currCard.y + currCard.height) + rowGap
              : Math.min(prevCard.y, currCard.y) - rowGap
            ctx.lineTo(prev.x, liftY)
            ctx.lineTo(curr.x, liftY)
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (absDx < 10) {
            if (lastVerticalDir !== null && dirY !== 0 && dirY !== lastVerticalDir) {
              const turnY = dirY > 0 ? feedMinY : feedMaxY
              ctx.lineTo(prev.x, turnY)
              ctx.lineTo(curr.x, turnY)
              ctx.lineTo(curr.x, curr.y)
            } else {
              ctx.lineTo(curr.x, curr.y)
            }
            if (dirY !== 0) lastVerticalDir = dirY
            continue
          }

          if (lastVerticalDir !== null && dirY !== 0 && dirY !== lastVerticalDir) {
            const turnY = dirY > 0 ? feedMinY : feedMaxY
            ctx.lineTo(prev.x, turnY)
            ctx.lineTo(curr.x, turnY)
            ctx.lineTo(curr.x, curr.y)
          } else {
            // Turn at the destination cabinet to avoid mid-span backtracking.
            ctx.lineTo(prev.x, curr.y)
            ctx.lineTo(curr.x, curr.y)
          }
          if (dirY !== 0) lastVerticalDir = dirY
        }
        ctx.stroke()
      }

      drawFeedConnections("rgba(2, 6, 23, 0.9)", outlineWidth)
      drawFeedConnections(lineColor, lineWidth)
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

    if (feed.manualMode && feed.id === activeFeedId && manualPoints.length > 0) {
      const handleRadius = 6 / zoom
      ctx.save()
      ctx.fillStyle = "#ffffff"
      ctx.strokeStyle = "#f97316"
      ctx.lineWidth = Math.max(1 / zoom, 0.8 / zoom)
      manualPoints.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
      ctx.restore()
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
  const draggingRoutePointRef = useRef<{ routeId: string; stepIndex: number } | null>(null)
  const draggingPowerPointRef = useRef<{ feedId: string; stepIndex: number } | null>(null)
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
    const controllerPlacement = layout.project.controllerPlacement ?? "external"
    const controllerCabinetId = layout.project.controllerCabinetId
    const controllerCabinet =
      controllerPlacement === "cabinet" && controllerCabinetId
        ? layout.cabinets.find((cabinet) => cabinet.id === controllerCabinetId)
        : null
    const controllerInCabinet = !!controllerCabinet
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
    const deferredCabinetLabels: {
      bounds: { x: number; y: number; width: number; height: number }
      label: string
      mode: "grid" | "internal"
    }[] = []

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
          deferredCabinetLabels.push({ bounds, label: displayLabel, mode: "grid" })
        } else {
          deferredCabinetLabels.push({ bounds, label: cabinet.id, mode: "internal" })
        }
      }

      if (controllerPlacement === "cabinet" && controllerCabinetId === cabinet.id) {
        drawControllerBadge(ctx, bounds, controller, zoom)
      }

      ctx.fillStyle = "#64748b"
      const smallFontSize = Math.max(8, 9 / zoom)
      ctx.font = `${smallFontSize}px Inter, sans-serif`
      ctx.textAlign = "right"
      ctx.textBaseline = "alphabetic"
      const sizeLabel = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
      ctx.fillText(sizeLabel, bounds.x + bounds.width - 6 / zoom, bounds.y + bounds.height - 6 / zoom)


      if (routingMode.type === "data" && isInActiveRoute) {
        const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
        if (route) {
          const cardCount = getCabinetReceiverCardCount(cabinet)
          const rects = cardCount > 0 ? getReceiverCardRects(bounds, zoom, cardCount) : []
          route.cabinetIds.forEach((endpointId, index) => {
            const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
            if (cabinetId !== cabinet.id) return
            const badgeSize = 18 / zoom
            const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex)
            const resolvedIndex = anchor.resolvedIndex ?? 0
            const anchorRect = rects[resolvedIndex]
            const badgeX = anchorRect
              ? anchorRect.x + anchorRect.width - badgeSize * 0.6
              : anchor.x + badgeSize * 0.1
            const badgeY = anchorRect ? anchorRect.y + badgeSize * 0.1 : anchor.y - badgeSize * 0.8
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
        routingMode.type === "data" ? routingMode.routeId : undefined,
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
        routingMode.type === "power" ? routingMode.feedId : undefined,
      )
    }

    if (showCabinetLabels && deferredCabinetLabels.length > 0) {
      deferredCabinetLabels.forEach(({ bounds, label, mode }) => {
        if (mode === "grid") {
          drawGridLabel(ctx, bounds, label, zoom)
          return
        }
        const fontSize = Math.max(12, 14 / zoom)
        ctx.fillStyle = "#e2e8f0"
        ctx.font = `${fontSize}px Inter, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(label, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)
      })
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
          drawPowerAnchorDot(ctx, rect, bounds, zoom)
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
    if (layout.cabinets.length > 0 && !controllerInCabinet) {
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
              return !!getCabinetBounds(cabinet, layout.cabinetTypes)
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
      const activeRoute =
        routingMode.type === "data" ? layout.project.dataRoutes.find((r) => r.id === routingMode.routeId) : null
      const activeFeed =
        routingMode.type === "power" ? layout.project.powerFeeds.find((f) => f.id === routingMode.feedId) : null
      const modeText =
        routingMode.type === "data"
          ? activeRoute?.manualMode
            ? `Manual routing: Port ${activeRoute.port || "?"} - Click empty space to add points, click cabinets to add/remove`
            : `Routing: Port ${activeRoute?.port || "?"} - Click cabinets to add/remove`
          : activeFeed?.manualMode
            ? `Manual power routing: Click empty space to add points, click cabinets to add/remove`
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
    const activeRoute =
      routingMode.type === "data" ? layout.project.dataRoutes.find((r) => r.id === routingMode.routeId) : null
    const activeFeed =
      routingMode.type === "power" ? layout.project.powerFeeds.find((f) => f.id === routingMode.feedId) : null

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }

    if (routingMode.type === "power" && activeFeed?.manualMode && e.button === 0) {
      const hitIndex = findManualStepIndex(activeFeed.steps, world, zoom)
      if (hitIndex !== null) {
        if (e.shiftKey) {
          const nextSteps = (activeFeed.steps || []).filter((_, index) => index !== hitIndex)
          dispatch({
            type: "UPDATE_POWER_FEED",
            payload: {
              id: activeFeed.id,
              updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
            },
          })
        } else {
          draggingPowerPointRef.current = { feedId: activeFeed.id, stepIndex: hitIndex }
        }
        return
      }

      if (cabinet && !e.shiftKey) {
        const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
        const existingIndex = nextSteps.findIndex(
          (step) => step.type === "cabinet" && step.endpointId === cabinet.id,
        )
        if (existingIndex >= 0) {
          nextSteps.splice(existingIndex, 1)
        } else {
          nextSteps.push({ type: "cabinet", endpointId: cabinet.id })
        }
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
          },
        })
        return
      }

      if (cabinet) {
        const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
        const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
        const reference = lastStep
          ? getPowerStepPosition(lastStep, layout.cabinets, layout.cabinetTypes, zoom)
          : null
        const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
        const snapped = getOrthogonalPoint(world, reference, snapStep)
        nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
          },
        })
        return
      }

      const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
      const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
      const reference = lastStep ? getPowerStepPosition(lastStep, layout.cabinets, layout.cabinetTypes, zoom) : null
      const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
      const snapped = getOrthogonalPoint(world, reference, snapStep)
      nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
      dispatch({
        type: "UPDATE_POWER_FEED",
        payload: {
          id: activeFeed.id,
          updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
        },
      })
      return
    }

    if (routingMode.type === "data" && activeRoute?.manualMode && e.button === 0) {
      const hitIndex = findManualStepIndex(activeRoute.steps, world, zoom)
      if (hitIndex !== null) {
        if (e.shiftKey) {
          const nextSteps = (activeRoute.steps || []).filter((_, index) => index !== hitIndex)
          dispatch({
            type: "UPDATE_DATA_ROUTE",
            payload: {
              id: activeRoute.id,
              updates: { steps: nextSteps, cabinetIds: getRouteCabinetIdsFromSteps(nextSteps) },
            },
          })
        } else {
          draggingRoutePointRef.current = { routeId: activeRoute.id, stepIndex: hitIndex }
        }
        return
      }

      if (cabinet && !e.shiftKey) {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        const cardCount = getCabinetReceiverCardCount(cabinet)
        if (!bounds) return
        if (cardCount === 0) {
          const normalizedX = clamp((world.x - bounds.x) / bounds.width, 0, 1)
          const normalizedY = clamp((world.y - bounds.y) / bounds.height, 0, 1)
          dispatch({
            type: "UPDATE_CABINET",
            payload: {
              id: cabinet.id,
              updates: { dataAnchorOverride: { x: normalizedX, y: normalizedY } },
            },
          })
        }

        const cardIndex = getReceiverCardIndexAtPoint(bounds, zoom, cardCount, world.x, world.y)
        const endpointId =
          cardCount === 1
            ? cabinet.id
            : formatRouteCabinetId(cabinet.id, cardIndex ?? undefined)

        const nextSteps = activeRoute.steps ? [...activeRoute.steps] : getRouteSteps(activeRoute)
        const existingIndex = nextSteps.findIndex(
          (step) => step.type === "cabinet" && step.endpointId === endpointId,
        )
        if (existingIndex >= 0) {
          nextSteps.splice(existingIndex, 1)
        } else {
          nextSteps.push({ type: "cabinet", endpointId })
        }
        dispatch({
          type: "UPDATE_DATA_ROUTE",
          payload: {
            id: activeRoute.id,
            updates: { steps: nextSteps, cabinetIds: getRouteCabinetIdsFromSteps(nextSteps) },
          },
        })
        return
      }

      if (cabinet) {
        const nextSteps = activeRoute.steps ? [...activeRoute.steps] : getRouteSteps(activeRoute)
        const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
        const reference = lastStep
          ? getRouteStepPosition(lastStep, layout.cabinets, layout.cabinetTypes, zoom)
          : null
        const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
        const snapped = getOrthogonalPoint(world, reference, snapStep)
        nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
        dispatch({
          type: "UPDATE_DATA_ROUTE",
          payload: {
            id: activeRoute.id,
            updates: { steps: nextSteps, cabinetIds: getRouteCabinetIdsFromSteps(nextSteps) },
          },
        })
        return
      }

      const nextSteps = activeRoute.steps ? [...activeRoute.steps] : getRouteSteps(activeRoute)
      const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
      const reference = lastStep ? getRouteStepPosition(lastStep, layout.cabinets, layout.cabinetTypes, zoom) : null
      const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
      const snapped = getOrthogonalPoint(world, reference, snapStep)
      nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
      dispatch({
        type: "UPDATE_DATA_ROUTE",
        payload: {
          id: activeRoute.id,
          updates: { steps: nextSteps, cabinetIds: getRouteCabinetIdsFromSteps(nextSteps) },
        },
      })
      return
    } else if (cabinet) {
      if (routingMode.type === "data") {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        const cardCount = getCabinetReceiverCardCount(cabinet)
        if (!bounds) return
        const route = activeRoute
        if (!route) return
        if (cardCount === 0) {
          const normalizedX = clamp((world.x - bounds.x) / bounds.width, 0, 1)
          const normalizedY = clamp((world.y - bounds.y) / bounds.height, 0, 1)
          const hasEndpoint = route.cabinetIds.some(
            (endpointId) => parseRouteCabinetId(endpointId).cabinetId === cabinet.id,
          )
          if (hasEndpoint) {
            const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom)
            const hitRadius = 10 / zoom
            if (Math.hypot(world.x - anchor.x, world.y - anchor.y) <= hitRadius) {
              dispatch({
                type: "REMOVE_CABINET_FROM_ROUTE",
                payload: { routeId: routingMode.routeId, endpointId: cabinet.id },
              })
              dispatch({
                type: "UPDATE_CABINET",
                payload: { id: cabinet.id, updates: { dataAnchorOverride: undefined } },
              })
              return
            }
          }
          dispatch({
            type: "UPDATE_CABINET",
            payload: {
              id: cabinet.id,
              updates: { dataAnchorOverride: { x: normalizedX, y: normalizedY } },
            },
          })

          if (!hasEndpoint) {
            dispatch({
              type: "ADD_CABINET_TO_ROUTE",
              payload: { routeId: routingMode.routeId, endpointId: cabinet.id },
            })
          }
          return
        }
        const cardIndex = getReceiverCardIndexAtPoint(bounds, zoom, cardCount, world.x, world.y)
        const existingEndpoint =
          cardCount === 1 ? route.cabinetIds.find((id) => parseRouteCabinetId(id).cabinetId === cabinet.id) : undefined
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
    if (draggingRoutePointRef.current && routingMode.type === "data") {
      const world = screenToWorld(e.clientX, e.clientY)
      const { routeId, stepIndex } = draggingRoutePointRef.current
      const route = layout.project.dataRoutes.find((r) => r.id === routeId)
      if (!route || !route.steps) return
      const prevStep = route.steps[stepIndex - 1]
      const nextStep = route.steps[stepIndex + 1]
      const reference =
        (prevStep && getRouteStepPosition(prevStep, layout.cabinets, layout.cabinetTypes, zoom)) ||
        (nextStep && getRouteStepPosition(nextStep, layout.cabinets, layout.cabinetTypes, zoom)) ||
        null
      const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
      const snapped = getOrthogonalPoint(world, reference, snapStep)
      const nextSteps = route.steps.map((step, index) =>
        index === stepIndex && step.type === "point" ? { ...step, x_mm: snapped.x, y_mm: snapped.y } : step,
      )
      dispatch({
        type: "UPDATE_DATA_ROUTE",
        payload: {
          id: routeId,
          updates: { steps: nextSteps, cabinetIds: getRouteCabinetIdsFromSteps(nextSteps) },
        },
      })
      return
    }

    if (draggingPowerPointRef.current && routingMode.type === "power") {
      const world = screenToWorld(e.clientX, e.clientY)
      const { feedId, stepIndex } = draggingPowerPointRef.current
      const feed = layout.project.powerFeeds.find((f) => f.id === feedId)
      if (!feed || !feed.steps) return
      const prevStep = feed.steps[stepIndex - 1]
      const nextStep = feed.steps[stepIndex + 1]
      const reference =
        (prevStep && getPowerStepPosition(prevStep, layout.cabinets, layout.cabinetTypes, zoom)) ||
        (nextStep && getPowerStepPosition(nextStep, layout.cabinets, layout.cabinetTypes, zoom)) ||
        null
      const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
      const snapped = getOrthogonalPoint(world, reference, snapStep)
      const nextSteps = feed.steps.map((step, index) =>
        index === stepIndex && step.type === "point" ? { ...step, x_mm: snapped.x, y_mm: snapped.y } : step,
      )
      dispatch({
        type: "UPDATE_POWER_FEED",
        payload: {
          id: feedId,
          updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps) },
        },
      })
      return
    }

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
    if (draggingRoutePointRef.current) {
      dispatch({ type: "PUSH_HISTORY" })
    }
    if (draggingPowerPointRef.current) {
      dispatch({ type: "PUSH_HISTORY" })
    }
    setIsPanning(false)
    isDraggingCabinetRef.current = false
    draggingCabinetIdRef.current = null
    dragStartPositionsRef.current = new Map()
    draggingRoutePointRef.current = null
    draggingPowerPointRef.current = null
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
