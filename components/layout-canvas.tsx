"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, validateLayout } from "@/lib/validation"
import type { Cabinet, CabinetType, DataRoute, DataRouteStep, LayoutData, PowerFeed } from "@/lib/types"
import {
  computeGridLabel,
  DEFAULT_LAYOUT,
  formatRouteCabinetId,
  getCabinetReceiverCardCount,
  parseRouteCabinetId,
} from "@/lib/types"
import { isDataRouteOverCapacity } from "@/lib/data-utils"
import { getPowerFeedLoadW, isPowerFeedOverloaded } from "@/lib/power-utils"
import { getEffectivePitchMm } from "@/lib/pitch-utils"
import { DEFAULT_RECEIVER_CARD_MODEL } from "@/lib/receiver-cards"
import { findRouteIdForEndpoint, getMappingNumberLabelMap } from "@/lib/mapping-numbers"
import { getOverviewReadabilityScale } from "@/lib/overview-utils"
import { getOrientedModuleSize } from "@/lib/module-utils"
import { resolveControllerCabinetId } from "@/lib/controller-utils"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, Maximize, Ruler } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type LayoutFocusRequestDetail = { entity: "data-route" | "power-feed"; id: string }
type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number }
const LAYOUT_FOCUS_EVENT = "layout:focus-route"

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

function includePointInBounds(bounds: WorldBounds | null, x: number, y: number): WorldBounds {
  if (!bounds) {
    return { minX: x, minY: y, maxX: x, maxY: y }
  }
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  }
}

function includeCabinetInBounds(
  bounds: WorldBounds | null,
  cabinetId: string,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): WorldBounds | null {
  const cabinet = cabinets.find((entry) => entry.id === cabinetId)
  if (!cabinet) return bounds
  const cabinetBounds = getCabinetBounds(cabinet, cabinetTypes)
  if (!cabinetBounds) return bounds
  const withTopLeft = includePointInBounds(bounds, cabinetBounds.x, cabinetBounds.y)
  return includePointInBounds(withTopLeft, cabinetBounds.x2, cabinetBounds.y2)
}

function finalizeFocusBounds(bounds: WorldBounds | null): WorldBounds | null {
  if (!bounds) return null
  const padding = 120
  const minSpan = 320
  let minX = bounds.minX - padding
  let maxX = bounds.maxX + padding
  let minY = bounds.minY - padding
  let maxY = bounds.maxY + padding
  const width = maxX - minX
  const height = maxY - minY
  if (width < minSpan) {
    const expand = (minSpan - width) / 2
    minX -= expand
    maxX += expand
  }
  if (height < minSpan) {
    const expand = (minSpan - height) / 2
    minY -= expand
    maxY += expand
  }
  return { minX, minY, maxX, maxY }
}

function getDataRouteFocusBounds(layout: LayoutData, routeId: string): WorldBounds | null {
  const route = layout.project.dataRoutes.find((entry) => entry.id === routeId)
  if (!route) return null
  let bounds: WorldBounds | null = null

  route.cabinetIds.forEach((endpointId) => {
    const { cabinetId } = parseRouteCabinetId(endpointId)
    bounds = includeCabinetInBounds(bounds, cabinetId, layout.cabinets, layout.cabinetTypes)
  })

  route.steps?.forEach((step) => {
    if (step.type === "point") {
      bounds = includePointInBounds(bounds, step.x_mm, step.y_mm)
      return
    }
    const { cabinetId } = parseRouteCabinetId(step.endpointId)
    bounds = includeCabinetInBounds(bounds, cabinetId, layout.cabinets, layout.cabinetTypes)
  })

  return finalizeFocusBounds(bounds)
}

function getPowerFeedFocusBounds(layout: LayoutData, feedId: string): WorldBounds | null {
  const feed = layout.project.powerFeeds.find((entry) => entry.id === feedId)
  if (!feed) return null
  let bounds: WorldBounds | null = null

  feed.assignedCabinetIds.forEach((cabinetId) => {
    bounds = includeCabinetInBounds(bounds, cabinetId, layout.cabinets, layout.cabinetTypes)
  })

  feed.steps?.forEach((step) => {
    if (step.type === "point") {
      bounds = includePointInBounds(bounds, step.x_mm, step.y_mm)
      return
    }
    bounds = includeCabinetInBounds(bounds, step.endpointId, layout.cabinets, layout.cabinetTypes)
  })

  return finalizeFocusBounds(bounds)
}

function getFocusBoundsForRequest(layout: LayoutData, detail: LayoutFocusRequestDetail): WorldBounds | null {
  if (detail.entity === "data-route") {
    return getDataRouteFocusBounds(layout, detail.id)
  }
  return getPowerFeedFocusBounds(layout, detail.id)
}

function getConnectedScreenBoundsFromCabinets(
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
  const entries = cabinets
    .map((cabinet) => {
      const bounds = getCabinetBounds(cabinet, cabinetTypes)
      if (!bounds) return null
      return { bounds }
    })
    .filter((entry): entry is { bounds: NonNullable<ReturnType<typeof getCabinetBounds>> } => entry !== null)

  if (entries.length === 0) return []

  const areConnected = (
    a: NonNullable<ReturnType<typeof getCabinetBounds>>,
    b: NonNullable<ReturnType<typeof getCabinetBounds>>,
  ) => {
    const tolerance = 1
    const overlapX = a.x < b.x2 && a.x2 > b.x
    const overlapY = a.y < b.y2 && a.y2 > b.y
    if (overlapX && overlapY) return true
    const horizontalTouch =
      (Math.abs(a.x2 - b.x) <= tolerance || Math.abs(b.x2 - a.x) <= tolerance) && !(a.y2 <= b.y || b.y2 <= a.y)
    const verticalTouch =
      (Math.abs(a.y2 - b.y) <= tolerance || Math.abs(b.y2 - a.y) <= tolerance) && !(a.x2 <= b.x || b.x2 <= a.x)
    return horizontalTouch || verticalTouch
  }

  const visited = new Array(entries.length).fill(false)
  const groups: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = []

  for (let i = 0; i < entries.length; i++) {
    if (visited[i]) continue
    visited[i] = true
    const queue = [i]
    let minX = entries[i].bounds.x
    let minY = entries[i].bounds.y
    let maxX = entries[i].bounds.x2
    let maxY = entries[i].bounds.y2

    while (queue.length > 0) {
      const current = queue.shift()
      if (current === undefined) continue
      const currentBounds = entries[current].bounds
      minX = Math.min(minX, currentBounds.x)
      minY = Math.min(minY, currentBounds.y)
      maxX = Math.max(maxX, currentBounds.x2)
      maxY = Math.max(maxY, currentBounds.y2)

      for (let j = 0; j < entries.length; j++) {
        if (visited[j]) continue
        if (!areConnected(currentBounds, entries[j].bounds)) continue
        visited[j] = true
        queue.push(j)
      }
    }

    groups.push({ minX, minY, maxX, maxY })
  }

  groups.sort((a, b) => {
    const yDiff = a.minY - b.minY
    if (Math.abs(yDiff) > 1) return yDiff
    return a.minX - b.minX
  })

  return groups
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
  const screenBounds = getConnectedScreenBoundsFromCabinets(cabinets, cabinetTypes)
  if (screenBounds.length === 0) return
  const effectivePitch = getEffectivePitchMm(pitch_mm)

  screenBounds.forEach(({ minX, minY, maxX, maxY }) => {
    const totalWidth = Math.round(maxX - minX)
    const totalHeight = Math.round(maxY - minY)
    const widthPx = showPixels ? Math.round(totalWidth / effectivePitch) : undefined
    const heightPx = showPixels ? Math.round(totalHeight / effectivePitch) : undefined
    drawDimension(ctx, minX, minY, maxX, minY, totalWidth, zoom, "horizontal", 80, "#f59e0b", widthPx)
    drawDimension(ctx, maxX, minY, maxX, maxY, totalHeight, zoom, "vertical", 80, "#f59e0b", heightPx)
  })
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

type ReceiverCardVariant = "indoor" | "outdoor"
type OutdoorPowerFlowDirection = "ltr" | "rtl"

function getReceiverCardRect(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  heightFraction = 0.28,
  variant: ReceiverCardVariant = "indoor",
): ReceiverCardRect {
  const maxWidth = variant === "outdoor" ? Math.min(68 / zoom, bounds.width * 0.55) : Math.min(84 / zoom, bounds.width * 0.65)
  const minWidth = variant === "outdoor" ? Math.min(30 / zoom, maxWidth) : Math.min(40 / zoom, maxWidth)
  const maxHeight =
    variant === "outdoor"
      ? Math.min(29 / zoom, bounds.height * (heightFraction + 0.11))
      : Math.min(18 / zoom, bounds.height * heightFraction)
  const minHeight = variant === "outdoor" ? Math.min(16.5 / zoom, maxHeight) : Math.min(12 / zoom, maxHeight)
  const cardWidth = variant === "outdoor"
    ? Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.42))
    : Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
  const cardHeight = variant === "outdoor"
    ? Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.297))
    : Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
  const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
  const cardCenterY =
    variant === "outdoor"
      ? bounds.y + Math.min(160, bounds.height / 2)
      : bounds.y + bounds.height / 2
  const cardY = cardCenterY - cardHeight / 2
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
  variant: ReceiverCardVariant = "indoor",
): ReceiverCardRect[] {
  if (!bounds || count <= 0) return []
  const heightFraction = count === 2 ? 0.2 : 0.26
  const base = getReceiverCardRect(bounds, zoom, heightFraction, variant)
  if (count === 1) return [base]

  const gap = Math.min(10 / zoom, base.height)
  const totalHeight = base.height * 2 + gap
  const targetCenterY =
    variant === "outdoor"
      ? bounds.y + Math.min(160, bounds.height / 2)
      : bounds.y + bounds.height / 2
  const startY = targetCenterY - totalHeight / 2
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

function getOutdoorReceiverCardDataPorts(rect: ReceiverCardRect, zoom: number) {
  const bodyH = Math.max(13 / zoom, rect.height * 0.97)
  const bodyW = Math.min(rect.width * 0.72, bodyH * 1.45)
  const bodyX = rect.centerX - bodyW / 2
  const portW = Math.max(5 / zoom, bodyW * 0.16)
  const portH = Math.max(3 / zoom, bodyH * 0.16)
  const portGap = Math.max(5 / zoom, bodyH * 0.58)
  const portX = bodyX - portW * 0.9
  const topPortY = rect.centerY - portGap / 2 - portH
  const bottomPortY = rect.centerY + portGap / 2
  const anchorX = portX + portW * 0.5
  return {
    in: { x: anchorX, y: topPortY + portH * 0.5 },
    out: { x: anchorX, y: bottomPortY + portH * 0.5 },
  }
}

function getReceiverCardIndexAtPoint(
  bounds: { x: number; y: number; width: number; height: number } | null,
  zoom: number,
  count: 0 | 1 | 2,
  pointX: number,
  pointY: number,
  variant: ReceiverCardVariant = "indoor",
): number | null {
  if (!bounds) return null
  const rects = getReceiverCardRects(bounds, zoom, count, variant)
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

function getOutdoorPowerFlowDirectionByCabinet(
  feeds: PowerFeed[],
  cabinets: Cabinet[],
): Map<string, OutdoorPowerFlowDirection> {
  const byId = new Map(cabinets.map((cabinet) => [cabinet.id, cabinet]))
  const flowByCabinet = new Map<string, OutdoorPowerFlowDirection>()

  feeds.forEach((feed) => {
    const cabinetSteps = getPowerSteps(feed).filter(
      (step): step is Extract<DataRouteStep, { type: "cabinet" }> => step.type === "cabinet",
    )
    const cabinetIds = cabinetSteps.map((step) => step.endpointId).filter((id) => byId.has(id))

    cabinetIds.forEach((cabinetId, index) => {
      if (flowByCabinet.has(cabinetId)) return
      const current = byId.get(cabinetId)
      if (!current) return

      let dir = 0
      const nextId = cabinetIds[index + 1]
      if (nextId) {
        const next = byId.get(nextId)
        if (next) {
          const dx = next.x_mm - current.x_mm
          if (Math.abs(dx) > 1) dir = Math.sign(dx)
        }
      }
      if (dir === 0) {
        const prevId = cabinetIds[index - 1]
        if (prevId) {
          const prev = byId.get(prevId)
          if (prev) {
            const dx = current.x_mm - prev.x_mm
            if (Math.abs(dx) > 1) dir = Math.sign(dx)
          }
        }
      }

      flowByCabinet.set(cabinetId, dir < 0 ? "rtl" : "ltr")
    })
  })

  return flowByCabinet
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
  cardVariant: ReceiverCardVariant = "indoor",
): { x: number; y: number } | null {
  if (step.type === "point") return { x: step.x_mm, y: step.y_mm }
  const { cabinetId, cardIndex } = parseRouteCabinetId(step.endpointId)
  const cabinet = cabinets.find((c) => c.id === cabinetId)
  if (!cabinet) return null
  const bounds = getCabinetBounds(cabinet, cabinetTypes)
  if (!bounds) return null
  const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, cardVariant)
  return { x: anchor.x, y: anchor.y }
}

function getPowerStepPosition(
  step: DataRouteStep,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
  cardVariant: ReceiverCardVariant = "indoor",
): { x: number; y: number } | null {
  if (step.type === "point") return { x: step.x_mm, y: step.y_mm }
  const cabinet = cabinets.find((c) => c.id === step.endpointId)
  if (!cabinet) return null
  const bounds = getCabinetBounds(cabinet, cabinetTypes)
  if (!bounds) return null
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  const layoutMidY = layoutBounds ? (layoutBounds.minY + layoutBounds.maxY) / 2 : bounds.y + bounds.height / 2
  const cardCount = getCabinetReceiverCardCount(cabinet)
  const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
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
  cardVariant: ReceiverCardVariant = "indoor",
): { x: number; y: number; resolvedIndex?: number; cardCount: 0 | 1 | 2; isVirtual: boolean } {
  const cardCount = getCabinetReceiverCardCount(cabinet)
  if (cardCount > 0) {
    const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
    const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
    const anchorRect = rects[resolvedIndex]
    if (anchorRect) {
      if (cardVariant === "outdoor") {
        const ports = getOutdoorReceiverCardDataPorts(anchorRect, zoom)
        return {
          x: ports.in.x,
          y: ports.in.y,
          resolvedIndex,
          cardCount,
          isVirtual: false,
        }
      }
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

function getPortLabelOffset(baseOffset: number, labelHeight: number) {
  return Math.max(baseOffset, labelHeight * 0.8)
}

function getPowerLabelOffset(baseOffset: number, boxHeight: number) {
  return Math.max(baseOffset, boxHeight * 0.78)
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

function getOutdoorCabinetPowerPorts(
  bounds: { x: number; y: number; width: number; height: number },
  cardRects: ReceiverCardRect[],
  zoom: number,
) {
  const cardBottom =
    cardRects.length > 0
      ? cardRects.reduce((maxBottom, rect) => Math.max(maxBottom, rect.y + rect.height), Number.NEGATIVE_INFINITY)
      : bounds.y + bounds.height * 0.34
  const minRequiredHeight = Math.max(bounds.height * 0.12, 18 / zoom)
  const maxBarY = bounds.y + bounds.height - minRequiredHeight
  const minBarY = cardBottom + 6 / zoom
  if (!Number.isFinite(maxBarY) || maxBarY <= bounds.y + 2 / zoom) return null

  const barY = Math.min(minBarY, maxBarY)
  const centerX = bounds.x + bounds.width / 2
  const barWidth = Math.min(bounds.width * 0.34, 220)
  const inX = centerX - barWidth * 0.24
  const outX = centerX + barWidth * 0.24
  const stemTopY = barY + 1.2 / zoom
  const stemBottomY = stemTopY + Math.max(6.8 / zoom, bounds.height * 0.05)
  const arrowHalfWidth = Math.max(3.2 / zoom, 0.24 * (stemBottomY - stemTopY))
  const labelY = stemBottomY + Math.max(5.8 / zoom, bounds.height * 0.038)
  const labelSize = Math.max(7.8 / zoom, 9 / zoom)

  return {
    barY,
    barLeftX: centerX - barWidth / 2,
    barRightX: centerX + barWidth / 2,
    stemTopY,
    stemBottomY,
    arrowHalfWidth,
    labelY,
    labelSize,
    left: { x: inX, y: stemBottomY },
    right: { x: outX, y: stemBottomY },
    in: { x: inX, y: stemBottomY },
    out: { x: outX, y: stemBottomY },
  }
}

function getOutdoorLvBoxRect(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
) {
  const inset = 6 / zoom
  const width = Math.max(78 / zoom, Math.min(bounds.width - inset * 2, bounds.width * 0.5))
  const height = Math.max(40 / zoom, Math.min(bounds.height - inset * 2, bounds.height * 0.33))
  return {
    x: bounds.x + bounds.width - width - inset,
    y: bounds.y + bounds.height - height - inset,
    width,
    height,
  }
}

function drawCabinetPowerInOut(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  cardRects: ReceiverCardRect[],
  zoom: number,
  variant: ReceiverCardVariant = "indoor",
  flowDirection: OutdoorPowerFlowDirection = "ltr",
) {
  if (variant !== "outdoor" || cardRects.length === 0) return

  const ports = getOutdoorCabinetPowerPorts(bounds, cardRects, zoom)
  if (!ports) return
  const inPort = flowDirection === "rtl" ? ports.right : ports.left
  const outPort = flowDirection === "rtl" ? ports.left : ports.right
  const labelOffsetX = Math.max(4.8 / zoom, bounds.width * 0.02)
  const labelOffsetY = Math.max(3.2 / zoom, bounds.height * 0.018)
  const inLabelX = inPort.x <= outPort.x ? inPort.x - labelOffsetX : inPort.x + labelOffsetX
  const outLabelX = outPort.x >= inPort.x ? outPort.x + labelOffsetX : outPort.x - labelOffsetX
  const labelY = ports.labelY + labelOffsetY

  ctx.save()
  ctx.strokeStyle = "#111827"
  ctx.lineWidth = Math.max(1.8 / zoom, 1.2 / zoom)
  ctx.beginPath()
  ctx.moveTo(ports.barLeftX, ports.barY)
  ctx.lineTo(ports.barRightX, ports.barY)
  ctx.stroke()

  ctx.strokeStyle = "#f97316"
  ctx.fillStyle = "#f97316"
  const powerLineWidth = scaledWorldSize(5.5, zoom, 3, 9.5)
  ctx.lineWidth = powerLineWidth
  const arrowTipLift = Math.max(4.2 / zoom, bounds.height * 0.02)
  const arrowBaseDrop = Math.max(1.8 / zoom, bounds.height * 0.009)
  ;[inPort.x, outPort.x].forEach((x) => {
    ctx.beginPath()
    ctx.moveTo(x, ports.stemBottomY)
    ctx.lineTo(x, ports.stemTopY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x, ports.stemTopY - arrowTipLift)
    ctx.lineTo(x - ports.arrowHalfWidth, ports.stemTopY + arrowBaseDrop)
    ctx.lineTo(x + ports.arrowHalfWidth, ports.stemTopY + arrowBaseDrop)
    ctx.closePath()
    ctx.fill()
  })

  ctx.font = `700 ${ports.labelSize}px Inter, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.lineJoin = "round"
  ctx.lineWidth = Math.max(2.6 / zoom, 1.6 / zoom)
  ctx.strokeStyle = "#0f172a"
  ctx.strokeText("IN", inLabelX, labelY)
  ctx.strokeText("OUT", outLabelX, labelY)
  ctx.fillText("IN", inLabelX, labelY)
  ctx.fillText("OUT", outLabelX, labelY)
  ctx.restore()
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
  options?: {
    variant?: "indoor" | "outdoor"
  },
) {
  const { x, y, width, height, centerX, centerY, connectorX, connectorY } = rect
  const variant = options?.variant ?? "indoor"

  if (variant === "outdoor") {
    const bodyH = Math.max(13 / zoom, height * 0.97)
    const bodyW = Math.min(width * 0.72, bodyH * 1.45)
    const bodyX = centerX - bodyW / 2
    const bodyY = centerY - bodyH / 2

    const stroke = Math.max(0.9 / zoom, 0.7 / zoom)
    const portW = Math.max(5 / zoom, bodyW * 0.16)
    const portH = Math.max(3 / zoom, bodyH * 0.16)
    const portGap = Math.max(5 / zoom, bodyH * 0.58)
    const portX = bodyX - portW * 0.9
    const topPortY = centerY - portGap / 2 - portH
    const bottomPortY = centerY + portGap / 2

    ctx.save()
    ctx.shadowColor = "rgba(2, 6, 23, 0.55)"
    ctx.shadowBlur = 4 / zoom
    ctx.shadowOffsetY = 1 / zoom
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH)
    ctx.restore()

    ctx.strokeStyle = "#1f2a44"
    ctx.lineWidth = stroke
    ctx.strokeRect(bodyX, bodyY, bodyW, bodyH)

    ctx.fillStyle = "#0f172a"
    ctx.fillRect(bodyX + 1 / zoom, bodyY + 1 / zoom, bodyW - 2 / zoom, Math.max(1.5 / zoom, bodyH * 0.08))

    ctx.fillStyle = "#94a3b8"
    ctx.fillRect(portX, topPortY, portW, portH)
    ctx.fillRect(portX, bottomPortY, portW, portH)

    const labelSize = Math.max(6 / zoom, bodyH * 0.28)
    ctx.fillStyle = "#e2e8f0"
    ctx.font = `bold ${labelSize}px Inter, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("I5", centerX, centerY)
    return
  }

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

type MappingLabelBox = { x: number; y: number; width: number; height: number }

function getMappingLabelMetrics(zoom: number, size: "small" | "medium" | "large") {
  const baseSize = size === "small" ? 10 : size === "large" ? 16 : 13
  return {
    fontSize: scaledWorldSize(baseSize, zoom, 9, 20),
    paddingX: scaledWorldSize(6, zoom, 4, 10),
    paddingY: scaledWorldSize(4, zoom, 3, 8),
    radius: scaledWorldSize(4, zoom, 3, 8),
    inset: scaledWorldSize(6, zoom, 4, 12),
  }
}

function getMappingLabelBox(
  ctx: CanvasRenderingContext2D,
  label: string,
  zoom: number,
  size: "small" | "medium" | "large",
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom",
  target: { x: number; y: number; width: number; height: number },
  override?: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom"; x?: number; y?: number },
): MappingLabelBox {
  const metrics = getMappingLabelMetrics(zoom, size)
  ctx.font = `bold ${metrics.fontSize}px Inter, sans-serif`
  const textWidth = ctx.measureText(label).width
  const boxWidth = textWidth + metrics.paddingX * 2
  const boxHeight = metrics.fontSize + metrics.paddingY * 2
  const fallbackPosition = position === "custom" ? "top-right" : position
  const resolvedPosition = override?.position ?? fallbackPosition
  const activeBounds = target

  let boxX = activeBounds.x + metrics.inset
  let boxY = activeBounds.y + metrics.inset

  if (resolvedPosition === "custom") {
    const anchorX = target.x + target.width * clamp(override?.x ?? 0.5, 0, 1)
    const anchorY = target.y + target.height * clamp(override?.y ?? 0.5, 0, 1)
    boxX = anchorX - boxWidth / 2
    boxY = anchorY - boxHeight / 2
  } else if (resolvedPosition === "top-right") {
    boxX = activeBounds.x + activeBounds.width - metrics.inset - boxWidth
    boxY = activeBounds.y + metrics.inset
  } else if (resolvedPosition === "bottom-left") {
    boxX = activeBounds.x + metrics.inset
    boxY = activeBounds.y + activeBounds.height - metrics.inset - boxHeight
  } else if (resolvedPosition === "bottom-right") {
    boxX = activeBounds.x + activeBounds.width - metrics.inset - boxWidth
    boxY = activeBounds.y + activeBounds.height - metrics.inset - boxHeight
  }

  const maxX = activeBounds.x + activeBounds.width - boxWidth
  const maxY = activeBounds.y + activeBounds.height - boxHeight
  const clampedMaxX = Math.max(activeBounds.x, maxX)
  const clampedMaxY = Math.max(activeBounds.y, maxY)

  return {
    x: clamp(boxX, activeBounds.x, clampedMaxX),
    y: clamp(boxY, activeBounds.y, clampedMaxY),
    width: boxWidth,
    height: boxHeight,
  }
}

type ModuleCell = { x: number; y: number; width: number; height: number; centerX: number; centerY: number }

function getModuleCells(
  bounds: { x: number; y: number; width: number; height: number },
  moduleWidth: number,
  moduleHeight: number,
  moduleGridOrigin?: { x: number; y: number } | null,
): ModuleCell[] {
  if (!moduleWidth || !moduleHeight) {
    return [
      {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.x + bounds.width / 2,
        centerY: bounds.y + bounds.height / 2,
      },
    ]
  }

  const originX = moduleGridOrigin?.x ?? bounds.x
  const originY = moduleGridOrigin?.y ?? bounds.y
  const startX = originX + Math.floor((bounds.x - originX) / moduleWidth) * moduleWidth
  const startY = originY + Math.floor((bounds.y - originY) / moduleHeight) * moduleHeight
  const endX = bounds.x + bounds.width
  const endY = bounds.y + bounds.height
  const cells: ModuleCell[] = []

  for (let x = startX; x < endX - 1e-6; x += moduleWidth) {
    const x1 = Math.max(x, bounds.x)
    const x2 = Math.min(x + moduleWidth, endX)
    if (x2 <= x1 + 1e-6) continue

    for (let y = startY; y < endY - 1e-6; y += moduleHeight) {
      const y1 = Math.max(y, bounds.y)
      const y2 = Math.min(y + moduleHeight, endY)
      if (y2 <= y1 + 1e-6) continue
      cells.push({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        centerX: (x1 + x2) / 2,
        centerY: (y1 + y2) / 2,
      })
    }
  }

  return cells
}

function drawMappingNumbers(
  ctx: CanvasRenderingContext2D,
  layout: LayoutData,
  zoom: number,
  mappingNumbers: LayoutData["project"]["overview"]["mappingNumbers"],
  labels: Map<string, string>,
  moduleWidth: number,
  moduleHeight: number,
  moduleGridOrigin?: { x: number; y: number } | null,
) {
  if (!mappingNumbers?.show || labels.size === 0) return

  const size = mappingNumbers.fontSize ?? "medium"
  const position = mappingNumbers.position ?? "top-right"
  const badge = mappingNumbers.badge ?? true
  const overrides = mappingNumbers.positionOverrides ?? {}
  const metrics = getMappingLabelMetrics(zoom, size)

  ctx.save()
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  layout.cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return
    const cardCount = getCabinetReceiverCardCount(cabinet)
    const moduleCells = getModuleCells(bounds, moduleWidth, moduleHeight, moduleGridOrigin)

    moduleCells.forEach((cell) => {
      const endpointId =
        cardCount === 2
          ? formatRouteCabinetId(cabinet.id, cell.centerY <= bounds.y + bounds.height / 2 ? 0 : 1)
          : cabinet.id
      const label = labels.get(endpointId)
      if (!label) return
      const box = getMappingLabelBox(ctx, label, zoom, size, position, cell, overrides[endpointId])

      if (badge) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)"
        ctx.strokeStyle = "#38bdf8"
        ctx.lineWidth = Math.max(0.9 / zoom, 0.6 / zoom)
        drawRoundedRect(ctx, box.x, box.y, box.width, box.height, metrics.radius)
        ctx.fill()
        ctx.stroke()
      }

      ctx.fillStyle = "#f8fafc"
      ctx.font = `bold ${metrics.fontSize}px Inter, sans-serif`
      ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2)
    })
  })

  ctx.restore()
}

function drawControllerBadge(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  label: string,
  zoom: number,
  mode: "indoor" | "outdoor" = "indoor",
) {
  if (mode === "outdoor") {
    const title = "LV BOX"
    const items = [label, "PI", "SWITCH", "ANTENNA"]
    const box = getOutdoorLvBoxRect(bounds, zoom)
    const boxWidth = box.width
    const boxHeight = box.height
    const boxX = box.x
    const boxY = box.y
    const titleBandHeight = Math.max(8 / zoom, boxHeight * 0.2)
    const listPadding = Math.max(4 / zoom, boxWidth * 0.08)
    const listTop = boxY + titleBandHeight + Math.max(2 / zoom, boxHeight * 0.03)
    const listBottom = boxY + boxHeight - Math.max(3 / zoom, boxHeight * 0.07)
    const itemStep = (listBottom - listTop) / items.length
    const titleFontSize = Math.max(6 / zoom, titleBandHeight * 0.45)
    const itemFontSize = Math.max(5.5 / zoom, itemStep * 0.55)

    ctx.save()
    ctx.shadowColor = "rgba(2, 6, 23, 0.45)"
    ctx.shadowBlur = 4 / zoom
    ctx.shadowOffsetY = 1 / zoom
    ctx.fillStyle = "#0b1220"
    ctx.strokeStyle = "#1f2a44"
    ctx.lineWidth = Math.max(1.1 / zoom, 0.8 / zoom)
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
    ctx.restore()

    ctx.strokeStyle = "#1f2a44"
    ctx.lineWidth = Math.max(1.1 / zoom, 0.8 / zoom)
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)
    ctx.strokeStyle = "#334155"
    ctx.lineWidth = Math.max(0.8 / zoom, 0.6 / zoom)
    ctx.beginPath()
    ctx.moveTo(boxX + listPadding, boxY + titleBandHeight)
    ctx.lineTo(boxX + boxWidth - listPadding, boxY + titleBandHeight)
    ctx.stroke()

    ctx.fillStyle = "#38bdf8"
    ctx.font = `700 ${titleFontSize}px Inter, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(title, boxX + listPadding, boxY + titleBandHeight / 2)

    ctx.fillStyle = "#e2e8f0"
    ctx.font = `600 ${itemFontSize}px Inter, sans-serif`
    items.forEach((item, index) => {
      const textY = listTop + itemStep * (index + 0.5)
      ctx.fillText(`- ${item}`, boxX + listPadding, textY)
    })
    return
  }

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
  cardVariant: ReceiverCardVariant = "indoor",
  outdoorLvBoxCabinetId?: string,
) {
  const lineWidth = scaledWorldSize(5, zoom, 3, 9)
  const outlineWidth = lineWidth + scaledWorldSize(3, zoom, 2, 6)
  const arrowSize = scaledWorldSize(12, zoom, 8, 20)
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPadding = scaledWorldSize(8, zoom, 6, 12)
  const labelRadius = scaledWorldSize(6, zoom, 4, 10)
  const baseLabelOffset = scaledWorldSize(90, zoom, 70, 140)
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
  const getNearestIndex = (values: number[], target: number) => {
    if (values.length === 0) return 0
    let bestIndex = 0
    let bestDistance = Math.abs(values[0] - target)
    for (let i = 1; i < values.length; i++) {
      const distance = Math.abs(values[i] - target)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }
    return bestIndex
  }

  dataRoutes.forEach((route, routeIndex) => {
    const hasManualSteps = !!route.manualMode && !!route.steps && route.steps.length > 0
    if (route.cabinetIds.length === 0 && !hasManualSteps) return
    const routeSteps =
      cardVariant === "outdoor"
        ? route.cabinetIds.map((endpointId) => ({ type: "cabinet" as const, endpointId }))
        : getRouteSteps(route)
    const hasManualPointSteps = !!(route.manualMode && route.steps && route.steps.some((step) => step.type === "point"))
    const useManualSteps = cardVariant !== "outdoor" && hasManualPointSteps
    const useOutdoorChaining = cardVariant === "outdoor"

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
      outdoorCabinetId?: string
      outdoorPortRole?: "in" | "out"
    }[] = []
    const virtualAnchors: { x: number; y: number }[] = []
    const manualPoints: { x: number; y: number }[] = []
    if (useOutdoorChaining) {
      const cabinetSteps = routeSteps.filter((step): step is Extract<DataRouteStep, { type: "cabinet" }> => step.type === "cabinet")
      const boundsByCabinetId = new Map<string, NonNullable<ReturnType<typeof getCabinetBounds>>>()
      cabinetSteps.forEach((step) => {
        const { cabinetId } = parseRouteCabinetId(step.endpointId)
        if (boundsByCabinetId.has(cabinetId)) return
        const cabinet = cabinets.find((entry) => entry.id === cabinetId)
        if (!cabinet) return
        const bounds = getCabinetBounds(cabinet, cabinetTypes)
        if (!bounds) return
        boundsByCabinetId.set(cabinetId, bounds)
      })
      const areCabinetsConnected = (
        a: NonNullable<ReturnType<typeof getCabinetBounds>>,
        b: NonNullable<ReturnType<typeof getCabinetBounds>>,
      ) => {
        const tolerance = 1
        const overlapX = a.x < b.x2 && a.x2 > b.x
        const overlapY = a.y < b.y2 && a.y2 > b.y
        if (overlapX && overlapY) return true
        const horizontalTouch =
          (Math.abs(a.x2 - b.x) <= tolerance || Math.abs(b.x2 - a.x) <= tolerance) && !(a.y2 <= b.y || b.y2 <= a.y)
        const verticalTouch =
          (Math.abs(a.y2 - b.y) <= tolerance || Math.abs(b.y2 - a.y) <= tolerance) && !(a.x2 <= b.x || b.x2 <= a.x)
        return horizontalTouch || verticalTouch
      }
      const isScreenTransitionBetweenSteps = (fromEndpointId: string, toEndpointId: string) => {
        const fromCabinetId = parseRouteCabinetId(fromEndpointId).cabinetId
        const toCabinetId = parseRouteCabinetId(toEndpointId).cabinetId
        const fromBounds = boundsByCabinetId.get(fromCabinetId)
        const toBounds = boundsByCabinetId.get(toCabinetId)
        if (!fromBounds || !toBounds) return false
        return !areCabinetsConnected(fromBounds, toBounds)
      }
      const getStepRowIndex = (endpointId: string) => {
        const { cabinetId } = parseRouteCabinetId(endpointId)
        const boundsForRow = boundsByCabinetId.get(cabinetId)
        if (!boundsForRow) return null
        return getNearestIndex(rowCenters, boundsForRow.y + boundsForRow.height / 2)
      }
      let previousExitIsTop: boolean | null = null
      cabinetSteps.forEach((step, stepIndex) => {
        const { cabinetId, cardIndex } = parseRouteCabinetId(step.endpointId)
        const cabinet = cabinets.find((c) => c.id === cabinetId)
        if (!cabinet) return
        const bounds = getCabinetBounds(cabinet, cabinetTypes)
        if (!bounds) return
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
        const rowIndex = getNearestIndex(rowCenters, center.y)
        const cardCount = getCabinetReceiverCardCount(cabinet)
        const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(cardCount - 1, cardIndex))
        const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
        const hasReceiverCard =
          cardCount > 0 &&
          showReceiverCards &&
          (cabinet.receiverCardOverride === null ? false : !!(cabinet.receiverCardOverride || receiverCardModel))

        const anchorRect = rects[resolvedIndex]
        if (anchorRect) {
          const ports = getOutdoorReceiverCardDataPorts(anchorRect, zoom)
          let entryIsTop: boolean
          if (previousExitIsTop !== null) {
            entryIsTop = previousExitIsTop
          } else {
            let sameRowSegmentLength = 1
            for (let lookAhead = stepIndex + 1; lookAhead < cabinetSteps.length; lookAhead++) {
              const nextRowIndex = getStepRowIndex(cabinetSteps[lookAhead].endpointId)
              if (nextRowIndex === null || nextRowIndex !== rowIndex) break
              sameRowSegmentLength += 1
            }
            entryIsTop = sameRowSegmentLength % 2 === 0
          }
          if (stepIndex > 0) {
            const isScreenTransitionFromPrevious = isScreenTransitionBetweenSteps(
              cabinetSteps[stepIndex - 1].endpointId,
              step.endpointId,
            )
            if (isScreenTransitionFromPrevious) {
              // On screen-to-screen jump, enter the next cabinet from the bottom port.
              entryIsTop = false
            }
          }
          let exitIsTop = !entryIsTop
          if (stepIndex >= 0 && stepIndex + 1 < cabinetSteps.length) {
            const nextRowIndex = getStepRowIndex(cabinetSteps[stepIndex + 1].endpointId)
            const isRowTransition = nextRowIndex !== null && nextRowIndex !== rowIndex
            const isScreenTransitionToNext = isScreenTransitionBetweenSteps(
              step.endpointId,
              cabinetSteps[stepIndex + 1].endpointId,
            )
            if (isRowTransition && !isScreenTransitionToNext) {
              // Within one screen, row transitions leave from top ports.
              exitIsTop = true
            }
          }
          const entryPort = entryIsTop ? ports.in : ports.out
          const exitPort = exitIsTop ? ports.in : ports.out
          points.push({
            x: entryPort.x,
            y: entryPort.y,
            bounds,
            hasReceiverCard,
            cardIndex: resolvedIndex,
            isVirtualAnchor: false,
            outdoorCabinetId: cabinet.id,
            outdoorPortRole: "in",
          })
          points.push({
            x: exitPort.x,
            y: exitPort.y,
            bounds,
            hasReceiverCard,
            cardIndex: resolvedIndex,
            isVirtualAnchor: false,
            outdoorCabinetId: cabinet.id,
            outdoorPortRole: "out",
          })
          previousExitIsTop = exitIsTop
          return
        }

        const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, cardVariant)
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
        previousExitIsTop = previousExitIsTop ?? true
      })
    } else {
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
        const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, cardVariant)
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
    }

    if (points.length === 0) {
      ctx.restore()
      return
    }

    const firstPoint = points[0]
    const firstBounds = firstPoint.bounds
    const isOutdoorDataRouting = cardVariant === "outdoor"
    const lvBoxDataSource =
      isOutdoorDataRouting && outdoorLvBoxCabinetId
        ? (() => {
            const controllerCabinet = cabinets.find((cabinet) => cabinet.id === outdoorLvBoxCabinetId)
            if (!controllerCabinet) return null
            const controllerBounds = getCabinetBounds(controllerCabinet, cabinetTypes)
            if (!controllerBounds) return null
            const lvBoxRect = getOutdoorLvBoxRect(controllerBounds, zoom)
            const sourceInset = scaledWorldSize(4.2, zoom, 2.8, 8)
            const laneStep = scaledWorldSize(4, zoom, 2, 7)
            const laneOffset = routeIndex * laneStep
            const sourceLeftBias = scaledWorldSize(18, zoom, 12, 30)
            const minX = lvBoxRect.x + sourceInset
            const maxX = lvBoxRect.x + lvBoxRect.width - sourceInset
            const sourceX = Math.max(
              minX,
              Math.min(
                maxX,
                lvBoxRect.x + lvBoxRect.width - sourceInset - laneOffset - sourceLeftBias,
              ),
            )
            return {
              x: sourceX,
              y: lvBoxRect.y,
            }
          })()
        : null
    const lvBoxDataReturnTarget =
      isOutdoorDataRouting && outdoorLvBoxCabinetId
        ? (() => {
            const controllerCabinet = cabinets.find((cabinet) => cabinet.id === outdoorLvBoxCabinetId)
            if (!controllerCabinet) return null
            const controllerBounds = getCabinetBounds(controllerCabinet, cabinetTypes)
            if (!controllerBounds) return null
            const lvBoxRect = getOutdoorLvBoxRect(controllerBounds, zoom)
            const targetInset = scaledWorldSize(4.2, zoom, 2.8, 8)
            return {
              x: lvBoxRect.x + lvBoxRect.width - targetInset,
              y: lvBoxRect.y,
            }
          })()
        : null

    let lineStartX = firstPoint.x
    let lineStartY = firstPoint.y

    if (!isOutdoorDataRouting) {
      const portLabel = `Port ${route.port}`
      ctx.font = `bold ${fontSize}px Inter, sans-serif`
      const labelWidth = ctx.measureText(portLabel).width + labelPadding * 2
      const labelHeight = fontSize + labelPadding * 1.6
      const labelOffset = getPortLabelOffset(baseLabelOffset, labelHeight)
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

      lineStartX = portLabelX
      lineStartY = portLabelY
      if (resolvedPosition === "left") {
        lineStartX = portLabelX + labelWidth / 2
      } else if (resolvedPosition === "right") {
        lineStartX = portLabelX - labelWidth / 2
      } else if (resolvedPosition === "top") {
        lineStartY = portLabelY + labelHeight / 2
      } else if (resolvedPosition === "bottom") {
        lineStartY = portLabelY - labelHeight / 2
      }
    } else if (lvBoxDataSource) {
      lineStartX = lvBoxDataSource.x
      lineStartY = lvBoxDataSource.y
    }

    if (Math.abs(lineStartX - firstPoint.x) > 0.01 || Math.abs(lineStartY - firstPoint.y) > 0.01) {
      const drawSourceToFirstConnection = (strokeStyle: string, width: number) => {
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(lineStartX, lineStartY)
        if (isOutdoorDataRouting) {
          if (Math.abs(firstPoint.y - lineStartY) > 0.01) {
            ctx.lineTo(lineStartX, firstPoint.y)
          }
          if (Math.abs(firstPoint.x - lineStartX) > 0.01) {
            ctx.lineTo(firstPoint.x, firstPoint.y)
          }
        } else {
          ctx.lineTo(firstPoint.x, firstPoint.y)
        }
        ctx.stroke()
      }

      drawSourceToFirstConnection("rgba(2, 6, 23, 0.9)", outlineWidth)
      drawSourceToFirstConnection(lineColor, lineWidth)
    }

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      const routeMinY = Math.min(...points.map((point) => point.y))
      const routeMaxY = Math.max(...points.map((point) => point.y))
      const layoutCenterX = (layoutBounds.minX + layoutBounds.maxX) / 2
      const areCabinetBoundsConnected = (
        a: NonNullable<(typeof points)[number]["bounds"]>,
        b: NonNullable<(typeof points)[number]["bounds"]>,
      ) => {
        const tolerance = 1
        const overlapX = a.x < b.x2 && a.x2 > b.x
        const overlapY = a.y < b.y2 && a.y2 > b.y
        if (overlapX && overlapY) return true
        const horizontalTouch =
          (Math.abs(a.x2 - b.x) <= tolerance || Math.abs(b.x2 - a.x) <= tolerance) && !(a.y2 <= b.y || b.y2 <= a.y)
        const verticalTouch =
          (Math.abs(a.y2 - b.y) <= tolerance || Math.abs(b.y2 - a.y) <= tolerance) && !(a.x2 <= b.x || b.x2 <= a.x)
        return horizontalTouch || verticalTouch
      }
      const drawRouteConnections = (strokeStyle: string, width: number) => {
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        let lastVerticalDir: number | null = null

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          if (
            useOutdoorChaining &&
            prev.outdoorCabinetId &&
            prev.outdoorCabinetId === curr.outdoorCabinetId &&
            prev.outdoorPortRole === "in" &&
            curr.outdoorPortRole === "out"
          ) {
            // Outdoor data does not draw an internal in->out bridge on the same card.
            ctx.moveTo(curr.x, curr.y)
            continue
          }
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          const dirY = Math.sign(dy) || 0
          const axisSnapTolerance = useOutdoorChaining ? 0.75 : 10
          const isOutdoorCabinetTransition =
            useOutdoorChaining &&
            !!prev.bounds &&
            !!curr.bounds &&
            prev.bounds !== curr.bounds

          if (absDx < axisSnapTolerance && absDy < axisSnapTolerance) {
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (useOutdoorChaining && absDy >= axisSnapTolerance && absDy > absDx) {
            const isInterScreenJump =
              !!prev.bounds && !!curr.bounds && !areCabinetBoundsConnected(prev.bounds, curr.bounds)
            const preferredDir = prev.x < layoutCenterX ? -1 : 1
            const prevCenterX = prev.bounds ? prev.bounds.x + prev.bounds.width / 2 : prev.x
            const currCenterX = curr.bounds ? curr.bounds.x + curr.bounds.width / 2 : curr.x
            const referenceWidth = Math.min(
              prev.bounds?.width ?? Number.POSITIVE_INFINITY,
              curr.bounds?.width ?? Number.POSITIVE_INFINITY,
            )
            const sameColumn = Number.isFinite(referenceWidth)
              ? Math.abs(prevCenterX - currCenterX) <= referenceWidth * 0.28
              : absDx <= 120 / zoom
            const gapPx = isInterScreenJump ? 32 : 16
            const gap = gapPx / Math.max(zoom, 0.001)
            const edgeInsetPx = isInterScreenJump ? 4 : 10
            const edgeInset = edgeInsetPx / Math.max(zoom, 0.001)
            const outsideAllowancePx = 0
            const outsideAllowance = outsideAllowancePx / Math.max(zoom, 0.001)
            const minLaneX = layoutBounds.minX + edgeInset - outsideAllowance
            const maxLaneX = layoutBounds.maxX - edgeInset + outsideAllowance
            const rightCandidate = Math.max(prev.x, curr.x) + gap
            const leftCandidate = Math.min(prev.x, curr.x) - gap

            if (isOutdoorCabinetTransition && sameColumn && absDx <= axisSnapTolerance * 2) {
              const laneSign = prev.x >= prevCenterX ? 1 : -1
              const forcedOffset = Number.isFinite(referenceWidth) ? Math.max(28 / zoom, referenceWidth * 0.1) : 28 / zoom
              const forcedLaneX = Math.max(minLaneX, Math.min(maxLaneX, prev.x + laneSign * forcedOffset))
              ctx.lineTo(forcedLaneX, prev.y)
              ctx.lineTo(forcedLaneX, curr.y)
              ctx.lineTo(curr.x, curr.y)
              if (dirY !== 0) lastVerticalDir = dirY
              continue
            }

            let laneX: number
            if (isOutdoorCabinetTransition && sameColumn) {
              const laneSign = prev.x >= prevCenterX ? 1 : -1
              const portMidX = (prev.x + curr.x) / 2
              const minBendOffset = Number.isFinite(referenceWidth) ? Math.max(24 / zoom, referenceWidth * 0.08) : 24 / zoom
              laneX = Math.max(minLaneX, Math.min(maxLaneX, portMidX + laneSign * minBendOffset))
            } else if (isInterScreenJump) {
              const alignedLaneX =
                preferredDir > 0
                  ? (lvBoxDataSource?.x ?? layoutBounds.maxX - edgeInset)
                  : layoutBounds.minX + edgeInset
              laneX = Math.max(minLaneX, Math.min(maxLaneX, alignedLaneX))
            } else if (preferredDir > 0) {
              laneX = Math.min(maxLaneX, rightCandidate)
            } else {
              laneX = Math.max(minLaneX, leftCandidate)
            }

            const minVisibleGap = (isInterScreenJump ? 4 : 12) / Math.max(zoom, 0.001)
            const tooClose = Math.abs(laneX - prev.x) < minVisibleGap || Math.abs(laneX - curr.x) < minVisibleGap
            const shouldKeepCenterLane = isOutdoorCabinetTransition && sameColumn
            if (tooClose) {
              if (shouldKeepCenterLane) {
                const laneSign = prev.x >= prevCenterX ? 1 : -1
                const portMidX = (prev.x + curr.x) / 2
                const enforcedGap = Number.isFinite(referenceWidth)
                  ? Math.max(minVisibleGap, referenceWidth * 0.08)
                  : Math.max(minVisibleGap, 24 / zoom)
                const preferredX = Math.max(minLaneX, Math.min(maxLaneX, portMidX + laneSign * enforcedGap))
                const alternateX = Math.max(minLaneX, Math.min(maxLaneX, portMidX - laneSign * enforcedGap))
                const preferredGapOk =
                  Math.abs(preferredX - prev.x) >= minVisibleGap && Math.abs(preferredX - curr.x) >= minVisibleGap
                const alternateGapOk =
                  Math.abs(alternateX - prev.x) >= minVisibleGap && Math.abs(alternateX - curr.x) >= minVisibleGap
                if (preferredGapOk) laneX = preferredX
                else if (alternateGapOk) laneX = alternateX
              } else if (isInterScreenJump) {
                const nudge = 2 / Math.max(zoom, 0.001)
                laneX =
                  preferredDir > 0
                    ? Math.min(maxLaneX, Math.max(laneX, Math.max(prev.x, curr.x) + nudge))
                    : Math.max(minLaneX, Math.min(laneX, Math.min(prev.x, curr.x) - nudge))
              } else {
                const altX = preferredDir > 0 ? Math.max(minLaneX, leftCandidate) : Math.min(maxLaneX, rightCandidate)
                const altGapOk = Math.abs(altX - prev.x) >= minVisibleGap && Math.abs(altX - curr.x) >= minVisibleGap
                if (altGapOk) laneX = altX
              }
            }
            ctx.lineTo(laneX, prev.y)
            ctx.lineTo(laneX, curr.y)
            ctx.lineTo(curr.x, curr.y)
            if (dirY !== 0) lastVerticalDir = dirY
            continue
          }

          if (absDx < axisSnapTolerance) {
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

          if (absDy < axisSnapTolerance) {
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

      if (useOutdoorChaining && lvBoxDataReturnTarget) {
        const lastPoint = points[points.length - 1]
        const overlapTolerance = scaledWorldSize(2.5, zoom, 1.2, 4.5)
        const hasSameRowDataRun = points.slice(0, -1).some(
          (point) => Math.abs(point.y - lastPoint.y) <= overlapTolerance && Math.abs(point.x - lastPoint.x) > 0.01,
        )
        const routeYMin = Math.min(...points.map((point) => point.y))
        const routeYMax = Math.max(...points.map((point) => point.y))
        const singleRowRoute = routeYMax - routeYMin <= scaledWorldSize(14, zoom, 8, 24)
        const shouldOffsetReturn = hasSameRowDataRun || singleRowRoute
        const returnRowOffset = shouldOffsetReturn ? scaledWorldSize(14, zoom, 10, 24) : 0
        const rowMargin = scaledWorldSize(6, zoom, 3, 10)
        const minReturnY = layoutBounds.minY + rowMargin
        const maxReturnY = layoutBounds.maxY - rowMargin
        let returnStartY = lastPoint.y
        if (returnRowOffset > 0) {
          const upY = lastPoint.y - returnRowOffset
          const downY = lastPoint.y + returnRowOffset
          if (upY >= minReturnY) {
            returnStartY = upY
          } else if (downY <= maxReturnY) {
            returnStartY = downY
          }
        }
        const laneGap = scaledWorldSize(8, zoom, 5, 14)
        const laneX = Math.max(
          lvBoxDataReturnTarget.x,
          (lvBoxDataSource?.x ?? lvBoxDataReturnTarget.x) + laneGap,
        )
        const drawReturnToLvBox = (strokeStyle: string, width: number) => {
          ctx.strokeStyle = strokeStyle
          ctx.lineWidth = width
          ctx.beginPath()
          ctx.moveTo(lastPoint.x, lastPoint.y)
          if (Math.abs(returnStartY - lastPoint.y) > 0.01) {
            ctx.lineTo(lastPoint.x, returnStartY)
          }
          if (Math.abs(laneX - lastPoint.x) > 0.01) {
            ctx.lineTo(laneX, returnStartY)
          }
          if (Math.abs(lvBoxDataReturnTarget.y - returnStartY) > 0.01) {
            ctx.lineTo(laneX, lvBoxDataReturnTarget.y)
          }
          if (Math.abs(lvBoxDataReturnTarget.x - laneX) > 0.01) {
            ctx.lineTo(lvBoxDataReturnTarget.x, lvBoxDataReturnTarget.y)
          }
          ctx.stroke()
        }

        drawReturnToLvBox("rgba(2, 6, 23, 0.9)", outlineWidth)
        drawReturnToLvBox("#ef4444", lineWidth)
      }

      if (useOutdoorChaining) {
        ctx.save()
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        const iconStroke = Math.max(scaledWorldSize(1.8, zoom, 1.2, 2.8), lineWidth * 0.3)
        const iconOutline = iconStroke + Math.max(scaledWorldSize(1.2, zoom, 0.8, 2), iconStroke * 0.34)
        const headLength = scaledWorldSize(5.8, zoom, 4.4, 9.8)
        const headSpan = headLength * 0.5

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          if (
            !prev.outdoorCabinetId ||
            prev.outdoorCabinetId !== curr.outdoorCabinetId ||
            prev.outdoorPortRole !== "in" ||
            curr.outdoorPortRole !== "out"
          ) {
            continue
          }
          let bridgeStartX = prev.x
          let bridgeStartY = prev.y
          let bridgeEndX = curr.x
          let bridgeEndY = curr.y
          let dy = bridgeEndY - bridgeStartY

          if (Math.abs(dy) < 0.01 && prev.outdoorCabinetId && prev.bounds) {
            const bridgeCabinet = cabinets.find((cabinet) => cabinet.id === prev.outdoorCabinetId)
            if (bridgeCabinet) {
              const cardCount = getCabinetReceiverCardCount(bridgeCabinet)
              const resolvedIndex = Math.max(0, Math.min(cardCount - 1, prev.cardIndex ?? 0))
              const rects = getReceiverCardRects(prev.bounds, zoom, cardCount, cardVariant)
              const bridgeRect = rects[resolvedIndex]
              if (bridgeRect) {
                const ports = getOutdoorReceiverCardDataPorts(bridgeRect, zoom)
                const distToIn = Math.abs(prev.y - ports.in.y)
                const distToOut = Math.abs(prev.y - ports.out.y)
                if (distToIn <= distToOut) {
                  bridgeStartX = ports.in.x
                  bridgeStartY = ports.in.y
                  bridgeEndX = ports.out.x
                  bridgeEndY = ports.out.y
                } else {
                  bridgeStartX = ports.out.x
                  bridgeStartY = ports.out.y
                  bridgeEndX = ports.in.x
                  bridgeEndY = ports.in.y
                }
                dy = bridgeEndY - bridgeStartY
              }
            }
          }
          if (Math.abs(dy) < 0.01) continue

          const dirY = Math.sign(dy) || 1
          const midY = (bridgeStartY + bridgeEndY) / 2
          const iconOffset = scaledWorldSize(10, zoom, 7, 16)
          const markerInset = scaledWorldSize(7, zoom, 4.5, 12)
          const minMarkerX = prev.bounds ? prev.bounds.x + markerInset : Number.NEGATIVE_INFINITY
          const maxMarkerX = prev.bounds ? prev.bounds.x + prev.bounds.width - markerInset : Number.POSITIVE_INFINITY
          const leftMarkerX = bridgeStartX - iconOffset
          const rightMarkerX = bridgeStartX + iconOffset
          let markerX = leftMarkerX
          if (markerX < minMarkerX && rightMarkerX <= maxMarkerX) {
            markerX = rightMarkerX
          }
          markerX = Math.max(minMarkerX, Math.min(maxMarkerX, markerX))
          const laneDir = markerX >= bridgeStartX ? 1 : -1
          const markerRadius = Math.max(
            scaledWorldSize(4.8, zoom, 3.6, 8.2),
            Math.min(Math.abs(dy) * 0.26, scaledWorldSize(8.2, zoom, 5.6, 13.2)),
          )
          const startY = midY - dirY * markerRadius
          const endY = midY + dirY * markerRadius
          const controlX = markerX + laneDir * markerRadius * 1.15

          const drawBridgeCurve = (strokeStyle: string, width: number) => {
            ctx.strokeStyle = strokeStyle
            ctx.lineWidth = width
            ctx.beginPath()
            ctx.moveTo(markerX, startY)
            ctx.quadraticCurveTo(controlX, midY, markerX, endY)
            ctx.stroke()
          }

          drawBridgeCurve("rgba(2, 6, 23, 0.78)", iconOutline)
          drawBridgeCurve(lineColor, iconStroke)

          const tangentX = markerX - controlX
          const tangentY = endY - midY
          const tangentLength = Math.hypot(tangentX, tangentY) || 1
          const ux = tangentX / tangentLength
          const uy = tangentY / tangentLength
          const baseX = markerX - ux * headLength
          const baseY = endY - uy * headLength
          const px = -uy
          const py = ux
          const leftX = baseX + px * headSpan
          const leftY = baseY + py * headSpan
          const rightX = baseX - px * headSpan
          const rightY = baseY - py * headSpan

          const drawBridgeHead = (strokeStyle: string, width: number) => {
            ctx.strokeStyle = strokeStyle
            ctx.lineWidth = width
            ctx.beginPath()
            ctx.moveTo(markerX, endY)
            ctx.lineTo(leftX, leftY)
            ctx.moveTo(markerX, endY)
            ctx.lineTo(rightX, rightY)
            ctx.stroke()
          }

          drawBridgeHead("rgba(2, 6, 23, 0.78)", iconOutline)
          drawBridgeHead(lineColor, iconStroke)
        }

        ctx.restore()
      }

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
  cardVariant: ReceiverCardVariant = "indoor",
  outdoorLvBoxCabinetId?: string,
) {
  const lineWidth = scaledWorldSize(5.5, zoom, 3, 9.5)
  const outlineWidth = lineWidth + scaledWorldSize(3, zoom, 2, 6)
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPadding = scaledWorldSize(9, zoom, 6, 13)
  const labelRadius = scaledWorldSize(7, zoom, 4.5, 11)
  const baseLabelOffset = scaledWorldSize(140, zoom, 105, 220)
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

  if (dataRoutes && dataRoutes.length > 0 && cardVariant !== "outdoor") {
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
    const dataBaseLabelOffset = scaledWorldSize(90, zoom, 70, 140)

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
      const anchorPoint = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, cardVariant)
      const anchor = { connectorX: anchorPoint.x, connectorY: anchorPoint.y }

      const labelText = `Port ${route.port}`
      ctx.font = `bold ${dataFontSize}px Inter, sans-serif`
      const labelWidth = ctx.measureText(labelText).width + dataLabelPadding * 2
      const labelHeight = dataFontSize + dataLabelPadding * 1.6
      const dataLabelOffset = getPortLabelOffset(dataBaseLabelOffset, labelHeight)

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
      const dataLabelOffset = getPortLabelOffset(dataBaseLabelOffset, dataLabelHeight)
      maxPortLabelBottom = layoutBounds.maxY + dataLabelOffset + dataLabelHeight / 2
    }
  }

  const labelGap = scaledWorldSize(14, zoom, 10, 22)
  const distributeLabelCenters = (
    items: { id: string; desiredX: number; width: number }[],
    gap: number,
  ) => {
    const sorted = [...items].sort((a, b) => a.desiredX - b.desiredX)
    const centers = new Map<string, number>()
    let lastRight = Number.NEGATIVE_INFINITY
    sorted.forEach((item) => {
      const half = item.width / 2
      const minCenter = lastRight + gap + half
      const center = item.desiredX < minCenter ? minCenter : item.desiredX
      centers.set(item.id, center)
      lastRight = center + half
    })
    return centers
  }

  const bottomPlans: { id: string; desiredX: number; width: number }[] = []
  const topPlans: { id: string; desiredX: number; width: number }[] = []

  type FeedPoint = {
    x: number
    y: number
    bounds: NonNullable<ReturnType<typeof getCabinetBounds>> | null
    cardRect?: ReceiverCardRect
    outdoorCabinetId?: string
    outdoorPortRole?: "in" | "out" | "lvbox"
  }

  const buildFeedPoints = (feedSteps: DataRouteStep[], useManualSteps: boolean, includeLvBoxLink: boolean) => {
    const points: FeedPoint[] = []
    const manualPoints: { x: number; y: number }[] = []
    const useOutdoorChaining = cardVariant === "outdoor" && !useManualSteps

    if (useOutdoorChaining) {
      const cabinetSteps = feedSteps.filter((step): step is Extract<DataRouteStep, { type: "cabinet" }> => step.type === "cabinet")
      cabinetSteps.forEach((step, index) => {
        const cabinet = cabinets.find((c) => c.id === step.endpointId)
        if (!cabinet) return
        const bounds = getCabinetBounds(cabinet, cabinetTypes)
        if (!bounds) return
        const cardCount = getCabinetReceiverCardCount(cabinet)
        const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
        const ports = getOutdoorCabinetPowerPorts(bounds, rects, zoom)
        if (!ports) return
        let direction = 0
        const nextStep = cabinetSteps[index + 1]
        if (nextStep) {
          const nextCabinet = cabinets.find((c) => c.id === nextStep.endpointId)
          if (nextCabinet) {
            const dx = nextCabinet.x_mm - cabinet.x_mm
            if (Math.abs(dx) > 1) direction = Math.sign(dx)
          }
        }
        if (direction === 0) {
          const prevStep = cabinetSteps[index - 1]
          if (prevStep) {
            const prevCabinet = cabinets.find((c) => c.id === prevStep.endpointId)
            if (prevCabinet) {
              const dx = cabinet.x_mm - prevCabinet.x_mm
              if (Math.abs(dx) > 1) direction = Math.sign(dx)
            }
          }
        }
        const entryPort = direction < 0 ? ports.right : ports.left
        const exitPort = direction < 0 ? ports.left : ports.right

        points.push({
          x: entryPort.x,
          y: entryPort.y,
          bounds,
          cardRect: rects[0],
          outdoorCabinetId: cabinet.id,
          outdoorPortRole: "in",
        })
        points.push({
          x: exitPort.x,
          y: exitPort.y,
          bounds,
          cardRect: rects[0],
          outdoorCabinetId: cabinet.id,
          outdoorPortRole: "out",
        })

        if (
          includeLvBoxLink &&
          outdoorLvBoxCabinetId &&
          cabinet.id === outdoorLvBoxCabinetId &&
          index === cabinetSteps.length - 1
        ) {
          const lvBoxRect = getOutdoorLvBoxRect(bounds, zoom)
          const anchorInset = Math.max(5 / zoom, lvBoxRect.width * 0.08)
          const lvAnchorX = clamp(exitPort.x, lvBoxRect.x + anchorInset, lvBoxRect.x + lvBoxRect.width - anchorInset)
          points.push({
            x: lvAnchorX,
            y: lvBoxRect.y,
            bounds,
            cardRect: rects[0],
            outdoorCabinetId: cabinet.id,
            outdoorPortRole: "lvbox",
          })
        }
      })

      return { points, manualPoints, useOutdoorChaining }
    }

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
      const rects = getReceiverCardRects(bounds, zoom, cardCount, cardVariant)
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

    return { points, manualPoints, useOutdoorChaining }
  }

  const resolveFeedLabelPosition = (
    feed: PowerFeed,
    feedBounds: { minX: number; minY: number; maxX: number; maxY: number },
    anchorX: number,
  ): "left" | "right" | "top" | "bottom" => {
    const explicit = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : null
    if (explicit) return explicit
    const edgeTolerance = scaledWorldSize(18, zoom, 10, 28)
    const isBottomRow = layoutBounds.maxY - feedBounds.maxY <= edgeTolerance
    if (isBottomRow) return "bottom"
    const layoutCenterX = (layoutBounds.minX + layoutBounds.maxX) / 2
    return anchorX >= layoutCenterX ? "right" : "left"
  }

  powerFeeds.forEach((feed) => {
    if (feed.assignedCabinetIds.length === 0) return
    const feedSteps = getPowerSteps(feed)
    const useManualSteps = !!(feed.manualMode && feed.steps && feed.steps.some((step) => step.type === "point"))
    const { points } = buildFeedPoints(feedSteps, useManualSteps, !!feed.connectLvBox)
    if (points.length === 0) return

    ctx.font = `bold ${fontSize}px Inter, sans-serif`
    const loadW = getPowerFeedLoadW(feed, cabinets, cabinetTypes, cardVariant === "outdoor" ? "outdoor" : "indoor")
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.customLabel?.trim() || feed.connector
    const maxTextWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(connectorText).width)
    const boxWidth = maxTextWidth + labelPadding * 2
    const feedBounds = getLayoutBoundsFromCabinets(
      cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
      cabinetTypes,
    )
    if (!feedBounds) return
    const labelPosition = resolveFeedLabelPosition(feed, feedBounds, points[0].x)
    if (labelPosition === "bottom") {
      bottomPlans.push({ id: feed.id, desiredX: points[0].x, width: boxWidth })
    } else if (labelPosition === "top") {
      topPlans.push({ id: feed.id, desiredX: points[0].x, width: boxWidth })
    }
  })

  const bottomCenters = distributeLabelCenters(bottomPlans, labelGap)
  const topCenters = distributeLabelCenters(topPlans, labelGap)

  powerFeeds.forEach((feed) => {
    if (feed.assignedCabinetIds.length === 0) return

    const isOverloaded = isPowerFeedOverloaded(
      feed,
      cabinets,
      cabinetTypes,
      cardVariant === "outdoor" ? "outdoor" : "indoor",
    )
    const lineColor = isOverloaded ? "#ef4444" : "#f97316"

    ctx.save()
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const feedSteps = getPowerSteps(feed)
    const useManualSteps = !!(feed.manualMode && feed.steps && feed.steps.some((step) => step.type === "point"))
    const { points, manualPoints, useOutdoorChaining } = buildFeedPoints(feedSteps, useManualSteps, !!feed.connectLvBox)

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
    const loadW = getPowerFeedLoadW(feed, cabinets, cabinetTypes, cardVariant === "outdoor" ? "outdoor" : "indoor")
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.customLabel?.trim() || feed.connector

    const maxTextWidth = Math.max(
      ctx.measureText(labelText).width,
      ctx.measureText(connectorText).width,
    )
    const boxWidth = maxTextWidth + labelPadding * 2
    const boxHeight = fontSize * 2.4 + labelPadding * 2
    const labelOffset = getPowerLabelOffset(baseLabelOffset, boxHeight)
    const labelPosition = resolveFeedLabelPosition(feed, feedBounds, points[0].x)
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
    if (labelPosition === "bottom") {
      labelCenterX = bottomCenters.get(feed.id) ?? labelCenterX
    } else if (labelPosition === "top") {
      labelCenterX = topCenters.get(feed.id) ?? labelCenterX
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
    const drawLabelConnector = (strokeStyle: string, width: number) => {
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(labelLineX, labelLineY)
      const dx = points[0].x - labelLineX
      const dy = points[0].y - labelLineY
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        ctx.lineTo(points[0].x, labelLineY)
      }
      ctx.lineTo(points[0].x, points[0].y)
      ctx.stroke()
    }

    drawLabelConnector("rgba(2, 6, 23, 0.9)", outlineWidth)
    drawLabelConnector(lineColor, lineWidth)

    // Draw connections between cabinets with orthogonal lines
    if (points.length > 1) {
      const drawFeedConnections = (strokeStyle: string, width: number) => {
        ctx.strokeStyle = strokeStyle
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        let lastDir: "h" | "v" | null = null

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          if (
            useOutdoorChaining &&
            prev.outdoorCabinetId &&
            prev.outdoorCabinetId === curr.outdoorCabinetId &&
            prev.outdoorPortRole === "in" &&
            curr.outdoorPortRole === "out"
          ) {
            // Keep a visual separation between IN and OUT inside the same cabinet.
            ctx.moveTo(curr.x, curr.y)
            continue
          }
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          const axisSnapTolerance = useOutdoorChaining ? 0.75 : 10

          if (useManualSteps) {
            if (absDx < 10 || absDy < 10) {
              ctx.lineTo(curr.x, curr.y)
              if (absDx < 10 && absDy >= 10) lastDir = "v"
              else if (absDy < 10 && absDx >= 10) lastDir = "h"
              continue
            }
            if (lastDir === "h") {
              ctx.lineTo(curr.x, prev.y)
              ctx.lineTo(curr.x, curr.y)
              lastDir = "v"
              continue
            }
            if (lastDir === "v") {
              ctx.lineTo(prev.x, curr.y)
              ctx.lineTo(curr.x, curr.y)
              lastDir = "h"
              continue
            }
            if (absDx >= absDy) {
              ctx.lineTo(curr.x, prev.y)
              ctx.lineTo(curr.x, curr.y)
              lastDir = "v"
            } else {
              ctx.lineTo(prev.x, curr.y)
              ctx.lineTo(curr.x, curr.y)
              lastDir = "h"
            }
            continue
          }

          const isOutdoorCabinetTransition =
            useOutdoorChaining &&
            prev.outdoorCabinetId &&
            curr.outdoorCabinetId &&
            prev.outdoorCabinetId !== curr.outdoorCabinetId
          const prevCenterX = prev.bounds ? prev.bounds.x + prev.bounds.width / 2 : prev.x
          const currCenterX = curr.bounds ? curr.bounds.x + curr.bounds.width / 2 : curr.x
          const referenceWidth = Math.min(
            prev.bounds?.width ?? Number.POSITIVE_INFINITY,
            curr.bounds?.width ?? Number.POSITIVE_INFINITY,
          )
          const sameColumn = Number.isFinite(referenceWidth)
            ? Math.abs(prevCenterX - currCenterX) <= referenceWidth * 0.28
            : absDx <= 120 / zoom

          if (isOutdoorCabinetTransition && absDy >= axisSnapTolerance && sameColumn) {
            // Deterministic outdoor same-column path:
            // OUT -> side lane -> vertical lane -> approach level -> IN.
            const laneSign = prev.x >= prevCenterX ? 1 : -1
            const laneOffset = Number.isFinite(referenceWidth)
              ? Math.max(28 / zoom, referenceWidth * 0.09)
              : 58 / zoom
            const laneBaseX = laneSign > 0 ? Math.max(prev.x, curr.x) : Math.min(prev.x, curr.x)
            const laneX = laneBaseX + laneSign * laneOffset
            const verticalDir = Math.sign(curr.y - prev.y) || 1
            const baseHeight = Math.min(
              prev.bounds?.height ?? Number.POSITIVE_INFINITY,
              curr.bounds?.height ?? Number.POSITIVE_INFINITY,
            )
            const minClearanceByCabinet = Number.isFinite(baseHeight)
              ? Math.max(36 / zoom, baseHeight * 0.24)
              : 48 / zoom
            const approachClearance = Math.min(
              Math.max(minClearanceByCabinet, absDy * 0.42),
              absDy * 0.5,
            )
            const approachY = curr.y - verticalDir * approachClearance
            ctx.lineTo(laneX, prev.y)
            ctx.lineTo(laneX, approachY)
            ctx.lineTo(curr.x, approachY)
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (absDx < axisSnapTolerance || absDy < axisSnapTolerance) {
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          if (isOutdoorCabinetTransition && absDy > absDx) {
            // For bottom<->top transitions, draw a clear L from source to destination.
            ctx.lineTo(curr.x, prev.y)
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          // Default turn at destination for mixed horizontal routing.
          ctx.lineTo(prev.x, curr.y)
          ctx.lineTo(curr.x, curr.y)
        }
        ctx.stroke()
      }

      drawFeedConnections("rgba(2, 6, 23, 0.9)", outlineWidth)
      drawFeedConnections(lineColor, lineWidth)
    }

    if (points.length > 0 && !useOutdoorChaining) {
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
  label: string,
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
  zoom: number,
  minY?: number,
  mode: "indoor" | "outdoor" = "indoor",
) {
  const layoutBounds = getLayoutBoundsFromCabinets(cabinets, cabinetTypes)
  if (!layoutBounds) return

  const { minX, maxX, maxY } = layoutBounds

  if (mode === "outdoor") {
    const title = "LV BOX"
    const items = [label, "PI", "SWITCH", "ANTENNA"]
    const boxWidth = scaledWorldSize(128, zoom, 110, 150)
    const boxHeight = scaledWorldSize(58, zoom, 46, 74)
    const boxX = maxX - boxWidth
    const baseY = maxY + scaledWorldSize(100, zoom, 70, 160)
    const boxY = Math.max(baseY, minY ?? baseY)
    const titleBandHeight = Math.max(10 / zoom, boxHeight * 0.24)
    const listPadding = Math.max(6 / zoom, boxWidth * 0.08)
    const listTop = boxY + titleBandHeight + Math.max(2 / zoom, boxHeight * 0.03)
    const listBottom = boxY + boxHeight - Math.max(3 / zoom, boxHeight * 0.07)
    const itemStep = (listBottom - listTop) / items.length
    const titleFontSize = Math.max(7 / zoom, titleBandHeight * 0.46)
    const itemFontSize = Math.max(6 / zoom, itemStep * 0.56)

    ctx.save()
    ctx.shadowColor = "rgba(2, 6, 23, 0.45)"
    ctx.shadowBlur = 4 / zoom
    ctx.shadowOffsetY = 1 / zoom
    ctx.fillStyle = "#0b1220"
    ctx.strokeStyle = "#1f2a44"
    ctx.lineWidth = Math.max(1.1 / zoom, 0.8 / zoom)
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
    ctx.restore()

    ctx.strokeStyle = "#1f2a44"
    ctx.lineWidth = Math.max(1.1 / zoom, 0.8 / zoom)
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)
    ctx.strokeStyle = "#334155"
    ctx.lineWidth = Math.max(0.9 / zoom, 0.7 / zoom)
    ctx.beginPath()
    ctx.moveTo(boxX + listPadding, boxY + titleBandHeight)
    ctx.lineTo(boxX + boxWidth - listPadding, boxY + titleBandHeight)
    ctx.stroke()

    ctx.fillStyle = "#38bdf8"
    ctx.font = `700 ${titleFontSize}px Inter, sans-serif`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(title, boxX + listPadding, boxY + titleBandHeight / 2)

    ctx.fillStyle = "#e2e8f0"
    ctx.font = `600 ${itemFontSize}px Inter, sans-serif`
    items.forEach((item, index) => {
      const textY = listTop + itemStep * (index + 0.5)
      ctx.fillText(`- ${item}`, boxX + listPadding, textY)
    })
    return
  }

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
  ctx.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2)

  ctx.restore()
}

export function LayoutCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { state, dispatch, generateCabinetId } = useEditor()
  const { layout, zoom, panX, panY, selectedCabinetId, selectedCabinetIds, showDimensions, routingMode } = state
  const overviewReadabilityScale = useMemo(() => getOverviewReadabilityScale(layout), [layout])
  const uiZoom = zoom / overviewReadabilityScale

  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 })
  const isDraggingCabinetRef = useRef(false)
  const draggingCabinetIdRef = useRef<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartWorldRef = useRef({ x: 0, y: 0 })
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const draggingRoutePointRef = useRef<{ routeId: string; stepIndex: number } | null>(null)
  const draggingPowerPointRef = useRef<{ feedId: string; stepIndex: number } | null>(null)
  const draggingMappingLabelRef = useRef<{ endpointId: string; cabinetId: string } | null>(null)
  const focusAnimationFrameRef = useRef<number | null>(null)
  const latestViewRef = useRef({ layout, zoom, panX, panY })
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

  useEffect(() => {
    latestViewRef.current = { layout, zoom, panX, panY }
  }, [layout, zoom, panX, panY])

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
    const controllerLabel = layout.project.controllerLabel?.trim() || controller
    const isOutdoorMode = (layout.project.mode ?? "indoor") === "outdoor"
    const outdoorFlowByCabinet = isOutdoorMode
      ? getOutdoorPowerFlowDirectionByCabinet(powerFeeds ?? [], layout.cabinets)
      : new Map<string, OutdoorPowerFlowDirection>()
    const controllerPlacement = layout.project.controllerPlacement ?? "external"
    const controllerCabinetId = resolveControllerCabinetId(
      isOutdoorMode ? "outdoor" : "indoor",
      controllerPlacement,
      layout.project.controllerCabinetId,
      layout.cabinets,
      layout.cabinetTypes,
    )
    const controllerCabinet =
      controllerPlacement === "cabinet" && controllerCabinetId
        ? layout.cabinets.find((cabinet) => cabinet.id === controllerCabinetId)
        : null
    const controllerInCabinet = !!controllerCabinet
    const labelsMode = overview?.labelsMode || "internal"
    const gridLabelAxis = overview?.gridLabelAxis ?? "columns"
    const showCabinetLabels = overview?.showCabinetLabels ?? true
    const showReceiverCards = overview?.showReceiverCards ?? true
    const receiverCardModel = overview?.receiverCardModel || DEFAULT_RECEIVER_CARD_MODEL
    const showDataRoutes = overview?.showDataRoutes ?? true
    const showPowerRoutes = overview?.showPowerRoutes ?? true
    const showModuleGrid = overview?.showModuleGrid ?? true
    const forcePortLabelsBottom = overview?.forcePortLabelsBottom ?? false
    const mappingNumbers = overview?.mappingNumbers ?? DEFAULT_LAYOUT.project.overview.mappingNumbers
    const showMappingNumbers = mappingNumbers?.show ?? false
    const mappingLabelMap = showMappingNumbers ? getMappingNumberLabelMap(layout) : new Map<string, string>()
    const moduleSize = overview?.moduleSize ?? "320x160"
    const moduleOrientation = overview?.moduleOrientation ?? "portrait"
    const { moduleWidth, moduleHeight } = getOrientedModuleSize(moduleSize, moduleOrientation)
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
        const inset = 1 / uiZoom
        ctx.beginPath()
        ctx.rect(bounds.x + inset, bounds.y + inset, bounds.width - inset * 2, bounds.height - inset * 2)
        ctx.clip()
        ctx.strokeStyle = "rgba(148, 163, 184, 0.22)"
        ctx.lineWidth = Math.max(0.8 / uiZoom, 0.6 / uiZoom)
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
      ctx.lineWidth = isSelected || isInActiveRoute ? 3 / uiZoom : 2.5 / uiZoom
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

      if (showCabinetLabels) {
        if (labelsMode === "grid") {
          const displayLabel = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes, gridLabelAxis)
          deferredCabinetLabels.push({ bounds, label: displayLabel, mode: "grid" })
        } else {
          deferredCabinetLabels.push({ bounds, label: cabinet.id, mode: "internal" })
        }
      }

      if (controllerPlacement === "cabinet" && controllerCabinetId === cabinet.id) {
        drawControllerBadge(ctx, bounds, controllerLabel, uiZoom, isOutdoorMode ? "outdoor" : "indoor")
      }

      ctx.fillStyle = "#64748b"
      const smallFontSize = Math.max(8, 9 / uiZoom)
      ctx.font = `${smallFontSize}px Inter, sans-serif`
      ctx.textAlign = "right"
      ctx.textBaseline = "alphabetic"
      const sizeLabel = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
      ctx.fillText(sizeLabel, bounds.x + bounds.width - 6 / uiZoom, bounds.y + bounds.height - 6 / uiZoom)


      if (routingMode.type === "data" && isInActiveRoute) {
        const route = layout.project.dataRoutes.find((r) => r.id === routingMode.routeId)
        if (route) {
          const cardCount = getCabinetReceiverCardCount(cabinet)
          const rects = cardCount > 0 ? getReceiverCardRects(bounds, uiZoom, cardCount, isOutdoorMode ? "outdoor" : "indoor") : []
          route.cabinetIds.forEach((endpointId, index) => {
            const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
            if (cabinetId !== cabinet.id) return
            const badgeSize = 18 / uiZoom
            const anchor = getCabinetDataAnchorPoint(
              cabinet,
              bounds,
              uiZoom,
              cardIndex,
              isOutdoorMode ? "outdoor" : "indoor",
            )
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
          uiZoom,
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
          uiZoom,
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
        uiZoom,
        showReceiverCards,
        receiverCardModel,
        forcePortLabelsBottom,
        layout.project.pitch_mm,
        routingMode.type === "data" ? routingMode.routeId : undefined,
        isOutdoorMode ? "outdoor" : "indoor",
        isOutdoorMode && controllerPlacement === "cabinet" ? controllerCabinetId : undefined,
      )
    }

    // Draw power feeds above data routes
    if (showPowerRoutes && powerFeeds && powerFeeds.length > 0) {
      drawPowerFeeds(
        ctx,
        powerFeeds,
        layout.cabinets,
        layout.cabinetTypes,
        uiZoom,
        dataRoutes,
        forcePortLabelsBottom,
        routingMode.type === "power" ? routingMode.feedId : undefined,
        isOutdoorMode ? "outdoor" : "indoor",
        isOutdoorMode && controllerPlacement === "cabinet" ? controllerCabinetId : undefined,
      )
    }

    if (showCabinetLabels && deferredCabinetLabels.length > 0) {
      deferredCabinetLabels.forEach(({ bounds, label, mode }) => {
        if (mode === "grid") {
          drawGridLabel(ctx, bounds, label, uiZoom)
          return
        }
        const fontSize = Math.max(12, 14 / uiZoom)
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
        const rects = getReceiverCardRects(bounds, uiZoom, cardCount, isOutdoorMode ? "outdoor" : "indoor")
        rects.forEach((rect) => {
          drawReceiverCard(ctx, rect, cardModel, uiZoom, {
            variant: isOutdoorMode ? "outdoor" : "indoor",
          })
          if (!isOutdoorMode) {
            drawPowerAnchorDot(ctx, rect, bounds, uiZoom)
          }
        })
        drawCabinetPowerInOut(
          ctx,
          bounds,
          rects,
          uiZoom,
          isOutdoorMode ? "outdoor" : "indoor",
          outdoorFlowByCabinet.get(cabinet.id) ?? "ltr",
        )
        })
      }

      if (showMappingNumbers) {
        drawMappingNumbers(
          ctx,
          layout,
          uiZoom,
          mappingNumbers,
          mappingLabelMap,
          moduleWidth,
          moduleHeight,
          moduleGridOrigin,
        )
      }

      if (routeBadges.length > 0) {
        const fontSize = Math.max(9, 10 / uiZoom)
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
          const fontSize = scaledWorldSize(14, uiZoom, 12, 18)
          const labelPadding = scaledWorldSize(8, uiZoom, 6, 12)
          const labelHeight = fontSize + labelPadding * 1.6
          const labelOffset = getPortLabelOffset(scaledWorldSize(90, uiZoom, 70, 140), labelHeight)

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
          const fontSize = scaledWorldSize(14, uiZoom, 12, 18)
          const labelPadding = scaledWorldSize(9, uiZoom, 6, 13)
          const boxHeight = fontSize * 2.4 + labelPadding * 2
          const labelOffset = getPowerLabelOffset(scaledWorldSize(140, uiZoom, 105, 220), boxHeight)
          const edgeTolerance = scaledWorldSize(18, uiZoom, 10, 28)

          powerFeeds.forEach((feed) => {
            if (feed.assignedCabinetIds.length === 0) return
            const feedBounds = getLayoutBoundsFromCabinets(
              layout.cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
              layout.cabinetTypes,
            )
            if (!feedBounds) return
            const explicit = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : null
            const labelPosition =
              explicit ?? (layoutBounds.maxY - feedBounds.maxY <= edgeTolerance ? "bottom" : "side")
            if (labelPosition !== "bottom") return
            const labelY = feedBounds.maxY + labelOffset
            const bottom = labelY + boxHeight
            powerLabelBottom = powerLabelBottom === null ? bottom : Math.max(powerLabelBottom, bottom)
          })
        }

        const clearance = scaledWorldSize(24, uiZoom, 16, 40)
        const controllerMinY = Math.max(
          layoutBounds.maxY + scaledWorldSize(120, uiZoom, 80, 200),
          (dataPortBottom ?? -Infinity) + clearance,
          (powerLabelBottom ?? -Infinity) + clearance,
        )
        drawControllerPorts(
          ctx,
          controllerLabel,
          layout.cabinets,
          layout.cabinetTypes,
          uiZoom,
          controllerMinY,
          isOutdoorMode ? "outdoor" : "indoor",
        )
      }
    }

    if (showDimensions && layout.cabinets.length > 0) {
      const showPixels = overview?.showPixels ?? true
      drawOverallDimensions(ctx, layout.cabinets, layout.cabinetTypes, uiZoom, layout.project.pitch_mm, showPixels)
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
            ? `Manual power routing: Click empty space to add points, click cabinets/LV box to set endpoint`
            : `Power Feed - Click cabinets/LV box to assign`

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
    uiZoom,
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
    const animateViewportTo = (
      fromPanX: number,
      fromPanY: number,
      fromZoom: number,
      toPanX: number,
      toPanY: number,
      toZoom: number,
    ) => {
      if (focusAnimationFrameRef.current !== null) {
        cancelAnimationFrame(focusAnimationFrameRef.current)
        focusAnimationFrameRef.current = null
      }
      const durationMs = 420
      const startTime = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / durationMs)
        const eased = 1 - (1 - progress) ** 3
        const currentZoom = fromZoom + (toZoom - fromZoom) * eased
        dispatch({ type: "SET_ZOOM", payload: currentZoom })
        dispatch({
          type: "SET_PAN",
          payload: {
            x: fromPanX + (toPanX - fromPanX) * eased,
            y: fromPanY + (toPanY - fromPanY) * eased,
          },
        })
        if (progress < 1) {
          focusAnimationFrameRef.current = requestAnimationFrame(tick)
        } else {
          focusAnimationFrameRef.current = null
        }
      }
      focusAnimationFrameRef.current = requestAnimationFrame(tick)
    }

    const handleFocusRequest = (event: Event) => {
      const detail = (event as CustomEvent<LayoutFocusRequestDetail>).detail
      if (!detail || !detail.id) return
      if (detail.entity !== "data-route" && detail.entity !== "power-feed") return

      requestAnimationFrame(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return

        const latest = latestViewRef.current
        const requestedBounds = getFocusBoundsForRequest(latest.layout, detail)
        const fallbackBounds = getLayoutBoundsFromCabinets(latest.layout.cabinets, latest.layout.cabinetTypes)
        const targetBounds = requestedBounds ?? fallbackBounds
        if (!targetBounds) return

        const targetWidth = Math.max(1, targetBounds.maxX - targetBounds.minX)
        const targetHeight = Math.max(1, targetBounds.maxY - targetBounds.minY)
        const fitZoom = clamp(
          Math.min((rect.width * 0.62) / targetWidth, (rect.height * 0.62) / targetHeight),
          0.1,
          5,
        )
        const minZoom = clamp(latest.zoom * 0.85, 0.1, 5)
        const maxZoom = clamp(latest.zoom * 1.35, 0.1, 5)
        const targetZoom = clamp(fitZoom, minZoom, maxZoom)
        const targetCenterX = (targetBounds.minX + targetBounds.maxX) / 2
        const targetCenterY = (targetBounds.minY + targetBounds.maxY) / 2
        const targetPanX = rect.width / 2 - targetCenterX * targetZoom
        const targetPanY = rect.height / 2 - targetCenterY * targetZoom

        if (
          Math.abs(targetPanX - latest.panX) < 1 &&
          Math.abs(targetPanY - latest.panY) < 1 &&
          Math.abs(targetZoom - latest.zoom) < 0.01
        ) {
          return
        }
        animateViewportTo(latest.panX, latest.panY, latest.zoom, targetPanX, targetPanY, targetZoom)
      })
    }

    window.addEventListener(LAYOUT_FOCUS_EVENT, handleFocusRequest as EventListener)
    return () => {
      window.removeEventListener(LAYOUT_FOCUS_EVENT, handleFocusRequest as EventListener)
      if (focusAnimationFrameRef.current !== null) {
        cancelAnimationFrame(focusAnimationFrameRef.current)
        focusAnimationFrameRef.current = null
      }
    }
  }, [dispatch])

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
    const mode = layout.project.mode ?? "indoor"
    const isOutdoorMode = mode === "outdoor"
    const controllerPlacement = layout.project.controllerPlacement ?? "external"
    const controllerCabinetId = resolveControllerCabinetId(
      isOutdoorMode ? "outdoor" : "indoor",
      controllerPlacement,
      layout.project.controllerCabinetId,
      layout.cabinets,
      layout.cabinetTypes,
    )
    let lvBoxHitCabinetId: string | null = null
    if (
      routingMode.type === "power" &&
      activeFeed &&
      isOutdoorMode &&
      controllerPlacement === "cabinet" &&
      controllerCabinetId
    ) {
      const controllerCabinet = layout.cabinets.find((item) => item.id === controllerCabinetId)
      const controllerBounds = controllerCabinet ? getCabinetBounds(controllerCabinet, layout.cabinetTypes) : null
      if (controllerBounds) {
        const lvBoxRect = getOutdoorLvBoxRect(controllerBounds, uiZoom)
        if (
          world.x >= lvBoxRect.x &&
          world.x <= lvBoxRect.x + lvBoxRect.width &&
          world.y >= lvBoxRect.y &&
          world.y <= lvBoxRect.y + lvBoxRect.height
        ) {
          lvBoxHitCabinetId = controllerCabinetId
        }
      }
    }
    const mappingNumbers = layout.project.overview.mappingNumbers ?? DEFAULT_LAYOUT.project.overview.mappingNumbers
    const showMappingNumbers = mappingNumbers?.show ?? false
    const moduleSize = layout.project.overview.moduleSize ?? "320x160"
    const moduleOrientation = layout.project.overview.moduleOrientation ?? "portrait"
    const { moduleWidth, moduleHeight } = getOrientedModuleSize(moduleSize, moduleOrientation)
    const moduleGridBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
    const moduleGridOrigin = moduleGridBounds ? { x: moduleGridBounds.minX, y: moduleGridBounds.minY } : null

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true)
      setLastPanPos({ x: e.clientX, y: e.clientY })
      return
    }

    if (
      showMappingNumbers &&
      mappingNumbers.position === "custom" &&
      routingMode.type === "none" &&
      cabinet &&
      e.button === 0
    ) {
      const ctx = canvasRef.current?.getContext("2d")
      if (ctx) {
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (bounds) {
          const labelMap = getMappingNumberLabelMap(layout)
          const cardCount = getCabinetReceiverCardCount(cabinet)
          const moduleCells = getModuleCells(bounds, moduleWidth, moduleHeight, moduleGridOrigin)
          for (const cell of moduleCells) {
            const endpointId =
              cardCount === 2
                ? formatRouteCabinetId(cabinet.id, cell.centerY <= bounds.y + bounds.height / 2 ? 0 : 1)
                : cabinet.id
            const label = labelMap.get(endpointId)
            if (!label) continue
            const box = getMappingLabelBox(
              ctx,
              label,
              zoom,
              mappingNumbers.fontSize ?? "medium",
              mappingNumbers.position ?? "top-right",
              cell,
              mappingNumbers.positionOverrides?.[endpointId],
            )
            if (
              world.x >= box.x &&
              world.x <= box.x + box.width &&
              world.y >= box.y &&
              world.y <= box.y + box.height
            ) {
              draggingMappingLabelRef.current = { endpointId, cabinetId: cabinet.id }
              return
            }
          }
        }
      }
    }

    if (
      showMappingNumbers &&
      mappingNumbers.mode === "manual" &&
      routingMode.type === "none" &&
      cabinet &&
      e.button === 0 &&
      !isMultiSelect
    ) {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      const cardCount = getCabinetReceiverCardCount(cabinet)
      let endpointId = cabinet.id
      if (bounds && cardCount === 2) {
        const moduleCells = getModuleCells(bounds, moduleWidth, moduleHeight, moduleGridOrigin)
        const hitCell = moduleCells.find(
          (cell) =>
            world.x >= cell.x &&
            world.x <= cell.x + cell.width &&
            world.y >= cell.y &&
            world.y <= cell.y + cell.height,
        )
        const cardIndex = hitCell
          ? hitCell.centerY <= bounds.y + bounds.height / 2
            ? 0
            : 1
          : world.y <= bounds.y + bounds.height / 2
            ? 0
            : 1
        endpointId = formatRouteCabinetId(cabinet.id, cardIndex)
      }
      const applyToChain = mappingNumbers.applyToChain ?? true
      const routeId = applyToChain ? findRouteIdForEndpoint(layout.project.dataRoutes, endpointId) : null
      const perChain = { ...(mappingNumbers.manualAssignments?.perChain ?? {}) }
      const perEndpoint = { ...(mappingNumbers.manualAssignments?.perEndpoint ?? {}) }
      const currentValue = perEndpoint[endpointId] ?? (routeId ? perChain[routeId] : "") ?? ""
      let nextValue = (mappingNumbers.manualValue ?? "").trim()

      if (!nextValue) {
        const prompted = window.prompt("Mapping number", currentValue)
        if (prompted === null) {
          return
        }
        nextValue = prompted.trim()
      }

      if (applyToChain && routeId) {
        if (nextValue.length > 0) {
          perChain[routeId] = nextValue
        } else {
          delete perChain[routeId]
        }
      } else if (nextValue.length > 0) {
        perEndpoint[endpointId] = nextValue
      } else {
        delete perEndpoint[endpointId]
      }

      dispatch({
        type: "UPDATE_OVERVIEW",
        payload: {
          mappingNumbers: {
            ...mappingNumbers,
            manualAssignments: { perChain, perEndpoint },
          },
        },
      })
      dispatch({ type: "PUSH_HISTORY" })
      return
    }

    if (lvBoxHitCabinetId && routingMode.type === "power" && activeFeed && e.button === 0) {
      if (activeFeed.connectLvBox) {
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { connectLvBox: false },
          },
        })
        return
      }

      if (activeFeed.manualMode) {
        const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
        const filtered = nextSteps.filter((step) => !(step.type === "cabinet" && step.endpointId === lvBoxHitCabinetId))
        filtered.push({ type: "cabinet", endpointId: lvBoxHitCabinetId })
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { steps: filtered, assignedCabinetIds: getPowerCabinetIdsFromSteps(filtered), connectLvBox: true },
          },
        })
      } else {
        const nextCabinetIds = [...activeFeed.assignedCabinetIds.filter((id) => id !== lvBoxHitCabinetId), lvBoxHitCabinetId]
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { assignedCabinetIds: nextCabinetIds, connectLvBox: true },
          },
        })
      }
      return
    }

    if (routingMode.type === "power" && activeFeed?.manualMode && e.button === 0) {
      const hitIndex = findManualStepIndex(activeFeed.steps, world, uiZoom)
      if (hitIndex !== null) {
        if (e.shiftKey) {
          const nextSteps = (activeFeed.steps || []).filter((_, index) => index !== hitIndex)
          dispatch({
            type: "UPDATE_POWER_FEED",
            payload: {
              id: activeFeed.id,
              updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps), connectLvBox: false },
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
            updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps), connectLvBox: false },
          },
        })
        return
      }

      if (cabinet) {
        const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
        const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
        const reference = lastStep
          ? getPowerStepPosition(
              lastStep,
              layout.cabinets,
              layout.cabinetTypes,
              uiZoom,
              (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
            )
          : null
        const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
        const snapped = getOrthogonalPoint(world, reference, snapStep)
        nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
        dispatch({
          type: "UPDATE_POWER_FEED",
          payload: {
            id: activeFeed.id,
            updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps), connectLvBox: false },
          },
        })
        return
      }

      const nextSteps = activeFeed.steps ? [...activeFeed.steps] : getPowerSteps(activeFeed)
      const lastStep = nextSteps.length > 0 ? nextSteps[nextSteps.length - 1] : null
      const reference = lastStep
        ? getPowerStepPosition(
            lastStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )
        : null
      const snapStep = getRouteSnapStepMm(layout.project.grid.step_mm)
      const snapped = getOrthogonalPoint(world, reference, snapStep)
      nextSteps.push({ type: "point", x_mm: snapped.x, y_mm: snapped.y })
      dispatch({
        type: "UPDATE_POWER_FEED",
        payload: {
          id: activeFeed.id,
          updates: { steps: nextSteps, assignedCabinetIds: getPowerCabinetIdsFromSteps(nextSteps), connectLvBox: false },
        },
      })
      return
    }

    if (routingMode.type === "data" && activeRoute?.manualMode && e.button === 0) {
      const hitIndex = findManualStepIndex(activeRoute.steps, world, uiZoom)
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

        const cardIndex = getReceiverCardIndexAtPoint(
          bounds,
          uiZoom,
          cardCount,
          world.x,
          world.y,
          (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
        )
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
          ? getRouteStepPosition(
              lastStep,
              layout.cabinets,
              layout.cabinetTypes,
              uiZoom,
              (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
            )
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
      const reference = lastStep
        ? getRouteStepPosition(
            lastStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )
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
            const anchor = getCabinetDataAnchorPoint(
              cabinet,
              bounds,
              uiZoom,
              undefined,
              (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
            )
            const hitRadius = 10 / uiZoom
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
        const cardIndex = getReceiverCardIndexAtPoint(
          bounds,
          uiZoom,
          cardCount,
          world.x,
          world.y,
          (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
        )
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
    if (draggingMappingLabelRef.current) {
      const world = screenToWorld(e.clientX, e.clientY)
      const { endpointId, cabinetId } = draggingMappingLabelRef.current
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const mappingNumbers = layout.project.overview.mappingNumbers ?? DEFAULT_LAYOUT.project.overview.mappingNumbers
      const moduleSize = layout.project.overview.moduleSize ?? "320x160"
      const moduleOrientation = layout.project.overview.moduleOrientation ?? "portrait"
      const { moduleWidth, moduleHeight } = getOrientedModuleSize(moduleSize, moduleOrientation)
      const moduleGridBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
      const moduleGridOrigin = moduleGridBounds ? { x: moduleGridBounds.minX, y: moduleGridBounds.minY } : null
      const moduleCells = getModuleCells(bounds, moduleWidth, moduleHeight, moduleGridOrigin)
      let targetCell =
        moduleCells.find(
          (cell) =>
            world.x >= cell.x &&
            world.x <= cell.x + cell.width &&
            world.y >= cell.y &&
            world.y <= cell.y + cell.height,
        ) ?? null
      if (!targetCell && moduleCells.length > 0) {
        targetCell = moduleCells.reduce((closest, cell) => {
          const prevDist = Math.hypot(closest.centerX - world.x, closest.centerY - world.y)
          const nextDist = Math.hypot(cell.centerX - world.x, cell.centerY - world.y)
          return nextDist < prevDist ? cell : closest
        }, moduleCells[0])
      }
      if (!targetCell) return
      const nextOverrides = { ...(mappingNumbers.positionOverrides ?? {}) }
      nextOverrides[endpointId] = {
        position: "custom",
        x: clamp((world.x - targetCell.x) / targetCell.width, 0, 1),
        y: clamp((world.y - targetCell.y) / targetCell.height, 0, 1),
      }
      dispatch({
        type: "UPDATE_OVERVIEW",
        payload: { mappingNumbers: { ...mappingNumbers, positionOverrides: nextOverrides } },
      })
      return
    }

    if (draggingRoutePointRef.current && routingMode.type === "data") {
      const world = screenToWorld(e.clientX, e.clientY)
      const { routeId, stepIndex } = draggingRoutePointRef.current
      const route = layout.project.dataRoutes.find((r) => r.id === routeId)
      if (!route || !route.steps) return
      const prevStep = route.steps[stepIndex - 1]
      const nextStep = route.steps[stepIndex + 1]
      const reference =
        (prevStep &&
          getRouteStepPosition(
            prevStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )) ||
        (nextStep &&
          getRouteStepPosition(
            nextStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )) ||
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
        (prevStep &&
          getPowerStepPosition(
            prevStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )) ||
        (nextStep &&
          getPowerStepPosition(
            nextStep,
            layout.cabinets,
            layout.cabinetTypes,
            uiZoom,
            (layout.project.mode ?? "indoor") === "outdoor" ? "outdoor" : "indoor",
          )) ||
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

        const updates: { id: string; updates: { x_mm: number; y_mm: number } }[] = []
        dragStartPositionsRef.current.forEach((pos, id) => {
          updates.push({
            id,
            updates: { x_mm: pos.x + snappedDx, y_mm: pos.y + snappedDy },
          })
        })
        dispatch({ type: "UPDATE_CABINETS", payload: updates })
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
    if (draggingMappingLabelRef.current) {
      dispatch({ type: "PUSH_HISTORY" })
    }
    setIsPanning(false)
    isDraggingCabinetRef.current = false
    draggingCabinetIdRef.current = null
    dragStartPositionsRef.current = new Map()
    draggingRoutePointRef.current = null
    draggingPowerPointRef.current = null
    draggingMappingLabelRef.current = null
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
