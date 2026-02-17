import type { LayoutData, LabelsMode, Cabinet, CabinetType, DataRouteStep } from "./types"
import { computeGridLabel, formatRouteCabinetId, getCabinetReceiverCardCount, parseRouteCabinetId } from "./types"
import { isDataRouteOverCapacity } from "./data-utils"
import { getPowerFeedLoadW, isPowerFeedOverloaded } from "./power-utils"
import { getCabinetBounds, getLayoutBounds, validateLayout } from "./validation"
import { getLayoutPixelDimensions, getReceiverCardLabel, shouldShowGridLabels } from "./overview-utils"
import { getMappingNumberLabelMap } from "./mapping-numbers"

export interface OverviewPalette {
  background: string
  gridLine: string
  cabinetFill: string
  cabinetFillAlt: string
  cabinetStroke: string
  cabinetSelected: string
  cabinetErrorFill: string
  cabinetErrorStroke: string
  labelPrimary: string
  labelSecondary: string
  receiverCardFill: string
  receiverCardStroke: string
  receiverCardText: string
  dimensionLine: string
  dimensionText: string
  moduleGridLine: string
}

export interface OverviewRenderOptions {
  zoom: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
  showGrid: boolean
  showOrigin: boolean
  labelsMode: LabelsMode
  showCabinetLabels?: boolean
  showDimensions: boolean
  showPixels: boolean
  showReceiverCards: boolean
  showDataRoutes: boolean
  showPowerRoutes: boolean
  showModuleGrid: boolean
  showMappingNumbers?: boolean
  uiScale?: number
  dimensionOffsetMm?: number
  dimensionSide?: "left" | "right"
  forcePortLabelsBottom?: boolean
  readabilityScale?: number
  selectedCabinetId?: string | null
  palette?: Partial<OverviewPalette>
}

const DEFAULT_PALETTE: OverviewPalette = {
  background: "#111111",
  gridLine: "#333333",
  cabinetFill: "rgba(56, 189, 248, 0.15)",
  cabinetFillAlt: "rgba(56, 189, 248, 0.15)",
  cabinetStroke: "#3b82f6",
  cabinetSelected: "#38bdf8",
  cabinetErrorFill: "rgba(220, 38, 38, 0.3)",
  cabinetErrorStroke: "#dc2626",
  labelPrimary: "#94a3b8",
  labelSecondary: "#64748b",
  receiverCardFill: "#ffffff",
  receiverCardStroke: "#000000",
  receiverCardText: "#111111",
  dimensionLine: "#94a3b8",
  dimensionText: "#e2e8f0",
  moduleGridLine: "rgba(148, 163, 184, 0.2)",
}

const FONT_FAMILY = "Geist, sans-serif"

function getLayoutBoundsFromCabinets(
  cabinets: Cabinet[],
  cabinetTypes: CabinetType[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (cabinets.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, cabinetTypes)
    if (!bounds) return
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x2)
    maxY = Math.max(maxY, bounds.y2)
  })

  if (minX === Number.POSITIVE_INFINITY) return null
  return { minX, minY, maxX, maxY }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, size * 0.55)
  ctx.lineTo(-size, -size * 0.55)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawDimensionLines(
  ctx: CanvasRenderingContext2D,
  layout: LayoutData,
  zoom: number,
  palette: OverviewPalette,
  showPixels: boolean,
  offsetTopMm = 40,
  offsetSideMm = offsetTopMm,
  side: "left" | "right" = "left",
  readabilityScale = 1,
) {
  const bounds = getLayoutBounds(layout)
  if (bounds.width === 0 || bounds.height === 0) return

  const fontSize = Math.max(11 * readabilityScale, (14 * readabilityScale) / zoom)
  ctx.strokeStyle = palette.dimensionLine
  ctx.fillStyle = palette.dimensionText
  ctx.lineWidth = (1.5 * readabilityScale) / zoom
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const topY = bounds.minY - offsetTopMm
  const leftX = bounds.minX - offsetSideMm
  const rightX = bounds.maxX + offsetSideMm

  // Horizontal dimension
  ctx.beginPath()
  ctx.moveTo(bounds.minX, topY)
  ctx.lineTo(bounds.maxX, topY)
  ctx.stroke()
  ctx.beginPath()
  ctx.stroke()
  drawArrow(ctx, bounds.minX, topY, Math.PI, (7 * readabilityScale) / zoom)
  drawArrow(ctx, bounds.maxX, topY, 0, (7 * readabilityScale) / zoom)

  // Vertical dimension
  const dimX = side === "right" ? rightX : leftX
  ctx.beginPath()
  ctx.moveTo(dimX, bounds.minY)
  ctx.lineTo(dimX, bounds.maxY)
  ctx.stroke()
  ctx.beginPath()
  ctx.stroke()
  drawArrow(ctx, dimX, bounds.minY, -Math.PI / 2, (7 * readabilityScale) / zoom)
  drawArrow(ctx, dimX, bounds.maxY, Math.PI / 2, (7 * readabilityScale) / zoom)

  const pixels = getLayoutPixelDimensions(layout)
  const widthLabel = showPixels && pixels.width_px
    ? `${bounds.width} mm / ${pixels.width_px} px`
    : `${bounds.width} mm`
  const heightLabel = showPixels && pixels.height_px
    ? `${bounds.height} mm / ${pixels.height_px} px`
    : `${bounds.height} mm`

  ctx.fillText(widthLabel, bounds.minX + bounds.width / 2, topY - (10 * readabilityScale) / zoom)

  ctx.save()
  const textOffset = side === "right" ? (10 * readabilityScale) / zoom : (-10 * readabilityScale) / zoom
  ctx.translate(dimX + textOffset, bounds.minY + bounds.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(heightLabel, 0, 0)
  ctx.restore()
}

type CardRect = { x: number; y: number; width: number; height: number }

function getReceiverCardRects(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  count: 0 | 1 | 2,
  readabilityScale = 1,
): CardRect[] {
  if (count <= 0) return []
  const maxWidth = Math.min((100 * readabilityScale) / zoom, bounds.width * 0.7)
  const minWidth = Math.min((34 * readabilityScale) / zoom, maxWidth)
  const heightFraction = count === 2 ? 0.18 : 0.22
  const maxHeight = Math.min((18 * readabilityScale) / zoom, bounds.height * (heightFraction + 0.03))
  const minHeight = Math.min((10 * readabilityScale) / zoom, maxHeight)
  const cardWidth = Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
  const cardHeight = Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
  const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
  const cardY = bounds.y + bounds.height / 2 - cardHeight / 2

  if (count === 1) {
    return [{ x: cardX, y: cardY, width: cardWidth, height: cardHeight }]
  }

  const gap = Math.min((10 * readabilityScale) / zoom, cardHeight)
  const totalHeight = cardHeight * 2 + gap
  const startY = bounds.y + bounds.height / 2 - totalHeight / 2
  return [
    { x: cardX, y: startY, width: cardWidth, height: cardHeight },
    { x: cardX, y: startY + cardHeight + gap, width: cardWidth, height: cardHeight },
  ]
}

function getReceiverCardRect(
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  readabilityScale = 1,
) {
  return getReceiverCardRects(bounds, zoom, 1, readabilityScale)[0]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getRouteSteps(route: LayoutData["project"]["dataRoutes"][number]): DataRouteStep[] {
  if (route.manualMode && route.steps && route.steps.length > 0) return route.steps
  return route.cabinetIds.map((endpointId) => ({ type: "cabinet", endpointId }))
}

function getCabinetDataAnchorPoint(
  cabinet: Cabinet,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  cardIndex?: number,
  readabilityScale = 1,
): { x: number; y: number; resolvedIndex?: number; cardCount: 0 | 1 | 2; isVirtual: boolean } {
  const cardCount = getCabinetReceiverCardCount(cabinet)
  if (cardCount > 0) {
    const rects = getReceiverCardRects(bounds, zoom, cardCount, readabilityScale)
    const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
    const anchorRect = rects[resolvedIndex]
    if (anchorRect) {
      return {
        x: anchorRect.x + anchorRect.width / 2,
        y: anchorRect.y + anchorRect.height + (6 * readabilityScale) / zoom,
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

function scaledReadableWorldSize(
  basePx: number,
  zoom: number,
  minPx: number,
  maxPx: number,
  readabilityScale: number,
) {
  return scaledWorldSize(basePx * readabilityScale, zoom, minPx * readabilityScale, maxPx * readabilityScale)
}

function getPortLabelOffset(baseOffset: number, labelHeight: number) {
  // Keep a minimum gap from cabinets while adapting to larger label boxes.
  return Math.max(baseOffset, labelHeight * 0.8)
}

function getPowerLabelOffset(baseOffset: number, boxHeight: number) {
  // Power labels are taller (2 lines), so they need a bit more clearance.
  return Math.max(baseOffset, boxHeight * 0.78)
}

function getDataRouteLabelExtents(
  ctx: CanvasRenderingContext2D,
  layout: LayoutData,
  zoom: number,
  forcePortLabelsBottom: boolean,
  readabilityScale = 1,
) {
  const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
  if (!layoutBounds || !layout.project.dataRoutes.length) return null

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

  const fontSize = scaledReadableWorldSize(14, zoom, 12, 18, readabilityScale)
  const labelPadding = scaledReadableWorldSize(8, zoom, 6, 12, readabilityScale)
  const labelSideGap = scaledReadableWorldSize(60, zoom, 40, 90, readabilityScale)
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`

  let minX = layoutBounds.minX
  let maxX = layoutBounds.maxX

  layout.project.dataRoutes.forEach((route) => {
    if (route.cabinetIds.length === 0 && !(route.manualMode && route.steps?.length)) return

    const steps = getRouteSteps(route)
    const firstCabinetStep = steps.find((step) => step.type === "cabinet") ?? null
    const firstBounds = (() => {
      if (!firstCabinetStep || firstCabinetStep.type !== "cabinet") return null
      const { cabinetId } = parseRouteCabinetId(firstCabinetStep.endpointId)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return null
      return getCabinetBounds(cabinet, layout.cabinetTypes)
    })()

    const portLabel = `Port ${route.port}`
    const labelWidth = ctx.measureText(portLabel).width + labelPadding * 2
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
      const firstCenterX = firstBounds ? firstBounds.x + firstBounds.width / 2 : layoutCenterX
      return firstCenterX >= layoutCenterX ? "right" : "left"
    })()

    if (resolvedPosition === "right") {
      const labelCenterX = layoutBounds.maxX + labelSideGap + labelWidth / 2
      maxX = Math.max(maxX, labelCenterX + labelWidth / 2)
    } else if (resolvedPosition === "left") {
      const labelCenterX = layoutBounds.minX - labelSideGap - labelWidth / 2
      minX = Math.min(minX, labelCenterX - labelWidth / 2)
    }
  })

  return { minX, maxX }
}

function fitTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, suffix = "...") {
  if (ctx.measureText(text).width <= maxWidth) return text
  let trimmed = text
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}${suffix}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.length > 0 ? `${trimmed}${suffix}` : suffix
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

function drawControllerBadge(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; width: number; height: number },
  label: string,
  zoom: number,
  readabilityScale = 1,
) {
  const fontSize = Math.max(9 * readabilityScale, (10 * readabilityScale) / zoom)
  const paddingX = (6 * readabilityScale) / zoom
  const paddingY = (3 * readabilityScale) / zoom
  const inset = (6 * readabilityScale) / zoom

  ctx.save()
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  const textWidth = ctx.measureText(label).width
  const boxWidth = textWidth + paddingX * 2
  const boxHeight = fontSize + paddingY * 2
  const boxX = bounds.x + bounds.width - boxWidth - inset
  const boxY = bounds.y + inset

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)"
  ctx.strokeStyle = "#38bdf8"
  ctx.lineWidth = Math.max((0.9 * readabilityScale) / zoom, (0.6 * readabilityScale) / zoom)
  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, (4 * readabilityScale) / zoom)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = "#e2e8f0"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2)
  ctx.restore()
}

function getPowerAnchorPoint(
  cardRect: CardRect,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  readabilityScale = 1,
) {
  const margin = Math.min((8 * readabilityScale) / zoom, bounds.width * 0.04)
  const offset = Math.min((6 * readabilityScale) / zoom, cardRect.width * 0.25)
  const anchorX = Math.max(bounds.x + margin, cardRect.x - offset)
  return { x: anchorX, y: cardRect.y + cardRect.height / 2 }
}

function drawPowerAnchorDot(
  ctx: CanvasRenderingContext2D,
  cardRect: CardRect,
  bounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  color: string,
  readabilityScale = 1,
) {
  const { x, y } = getPowerAnchorPoint(cardRect, bounds, zoom, readabilityScale)
  const radius = (3.2 * readabilityScale) / zoom
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function drawReceiverCard(
  ctx: CanvasRenderingContext2D,
  rect: CardRect,
  model: string,
  zoom: number,
  palette: OverviewPalette,
  readabilityScale = 1,
) {
  const { x, y, width, height } = rect
  const baseFontSize = Math.min((10 * readabilityScale) / zoom, height * 0.78)
  const minFontSize = (6 * readabilityScale) / zoom
  const padding = (4 * readabilityScale) / zoom
  const connectorX = x + width / 2
  const connectorY = y + height + (6 * readabilityScale) / zoom

  ctx.save()
  ctx.shadowColor = "rgba(15, 23, 42, 0.15)"
  ctx.shadowBlur = (6 * readabilityScale) / zoom
  ctx.shadowOffsetY = (2 * readabilityScale) / zoom
  ctx.fillStyle = palette.receiverCardFill
  ctx.fillRect(x, y, width, height)
  ctx.restore()

  ctx.strokeStyle = palette.receiverCardStroke
  ctx.lineWidth = (1 * readabilityScale) / zoom
  ctx.strokeRect(x, y, width, height)

  const borderInset = (1 * readabilityScale) / zoom
  ctx.fillStyle = palette.receiverCardStroke
  ctx.fillRect(x + borderInset, y + borderInset, width - borderInset * 2, 2 / zoom)

  const maxTextWidth = width - padding * 2
  let fontSize = baseFontSize
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  const textWidth = ctx.measureText(model).width
  if (textWidth > maxTextWidth && textWidth > 0) {
    fontSize = Math.max(minFontSize, fontSize * (maxTextWidth / textWidth))
  }

  ctx.fillStyle = palette.receiverCardText
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const fitted = fitTextToWidth(ctx, model, maxTextWidth)
  ctx.fillText(fitted, x + width / 2, y + height / 2)

  ctx.fillStyle = "#3b82f6"
  ctx.beginPath()
  ctx.arc(connectorX, connectorY, (3.2 * readabilityScale) / zoom, 0, Math.PI * 2)
  ctx.fill()
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
  ctx.font = `bold ${metrics.fontSize}px ${FONT_FAMILY}`
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
  moduleWidth: number,
  moduleHeight: number,
  moduleGridOrigin?: { x: number; y: number } | null,
) {
  if (!mappingNumbers?.show) return
  const labels = getMappingNumberLabelMap(layout)
  if (labels.size === 0) return

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
      ctx.font = `bold ${metrics.fontSize}px ${FONT_FAMILY}`
      ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2)
    })
  })

  ctx.restore()
}

function drawDataRoutes(
  ctx: CanvasRenderingContext2D,
  layout: LayoutData,
  zoom: number,
  showReceiverCards: boolean,
  receiverCardModel: string,
  forcePortLabelsBottom = false,
  readabilityScale = 1,
) {
  const { dataRoutes, pitch_mm } = layout.project
  if (!dataRoutes || dataRoutes.length === 0) return

  const lineWidth = scaledReadableWorldSize(5, zoom, 3, 9, readabilityScale)
  const outlineWidth = lineWidth + scaledReadableWorldSize(0.9, zoom, 0.6, 1.6, readabilityScale)
  const outlineColor = "rgba(15, 23, 42, 0.2)"
  const arrowSize = scaledReadableWorldSize(12, zoom, 8, 20, readabilityScale)
  const fontSize = scaledReadableWorldSize(14, zoom, 12, 18, readabilityScale)
  const labelPadding = scaledReadableWorldSize(8, zoom, 6, 12, readabilityScale)
  const labelRadius = scaledReadableWorldSize(6, zoom, 4, 10, readabilityScale)
  const baseLabelOffset = 90 * readabilityScale
  const labelSideGap = scaledReadableWorldSize(60, zoom, 40, 90, readabilityScale)

  const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
  if (!layoutBounds) return

  const { maxY } = layoutBounds
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

  dataRoutes.forEach((route) => {
    const hasManualSteps = !!route.manualMode && !!route.steps && route.steps.length > 0
    if (route.cabinetIds.length === 0 && !hasManualSteps) return
    const routeSteps = getRouteSteps(route)
    const useManualSteps = route.manualMode && route.steps && route.steps.length > 0

    const isOverloaded = isDataRouteOverCapacity(route, layout.cabinets, layout.cabinetTypes, pitch_mm)
    const lineColor = isOverloaded ? "#ef4444" : "#3b82f6"

    ctx.save()
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const points: {
      x: number
      y: number
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>> | null
      hasReceiverCard: boolean
      isVirtualAnchor: boolean
    }[] = []
    const virtualAnchors: { x: number; y: number }[] = []

    routeSteps.forEach((step) => {
      if (step.type === "point") {
        points.push({
          x: step.x_mm,
          y: step.y_mm,
          bounds: null,
          hasReceiverCard: false,
          isVirtualAnchor: false,
        })
        return
      }
      const { cabinetId, cardIndex } = parseRouteCabinetId(step.endpointId)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const anchor = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, readabilityScale)
      const hasReceiverCard = anchor.cardCount > 0 && showReceiverCards && !!getReceiverCardLabel(layout, cabinet)
      points.push({
        x: anchor.x,
        y: anchor.y,
        bounds,
        hasReceiverCard,
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
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
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
    ctx.lineWidth = scaledReadableWorldSize(2, zoom, 1.5, 3, readabilityScale)
    drawRoundedRect(ctx, portLabelX - labelWidth / 2, labelBoxY, labelWidth, labelHeight, labelRadius)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#f8fafc"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(portLabel, portLabelX, portLabelY)

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
    ctx.strokeStyle = outlineColor
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

      drawRouteConnections(outlineColor, outlineWidth)
      drawRouteConnections(lineColor, lineWidth)

      const lastPoint = points[points.length - 1]
      if (!lastPoint.hasReceiverCard) {
         const endSize = Math.max((3.2 * readabilityScale) / zoom, arrowSize * 0.35)
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
        ctx.arc(anchor.x, anchor.y, (3.2 * readabilityScale) / zoom, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.restore()
    }

    ctx.restore()
  })
}

function drawPowerFeeds(ctx: CanvasRenderingContext2D, layout: LayoutData, zoom: number, readabilityScale = 1) {
  const { powerFeeds } = layout.project
  if (!powerFeeds || powerFeeds.length === 0) return
  const getPowerSteps = (feed: LayoutData["project"]["powerFeeds"][number]): DataRouteStep[] => {
    if (feed.manualMode && feed.steps && feed.steps.length > 0) return feed.steps
    return feed.assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
  }

  const lineWidth = scaledReadableWorldSize(5.5, zoom, 3, 9.5, readabilityScale)
  const outlineWidth = lineWidth + scaledReadableWorldSize(0.9, zoom, 0.6, 1.6, readabilityScale)
  const outlineColor = "rgba(15, 23, 42, 0.2)"
  const fontSize = scaledReadableWorldSize(14, zoom, 12, 18, readabilityScale)
  const labelPaddingX = scaledReadableWorldSize(9, zoom, 6, 13, readabilityScale)
  const labelPaddingY = scaledReadableWorldSize(6, zoom, 4, 9, readabilityScale)
  const labelRadius = scaledReadableWorldSize(7, zoom, 4.5, 11, readabilityScale)
  const baseLabelOffset = 140 * readabilityScale
  const labelSideGap = scaledReadableWorldSize(110, zoom, 70, 160, readabilityScale)
  const dataLabelSideGap = scaledReadableWorldSize(60, zoom, 40, 90, readabilityScale)
  const sideLabelGap = scaledReadableWorldSize(12, zoom, 8, 18, readabilityScale)
  const breakBarSize = scaledReadableWorldSize(14, zoom, 10, 20, readabilityScale)
  const breakStemSize = scaledReadableWorldSize(10, zoom, 7, 16, readabilityScale)
  const breakHeadSize = scaledReadableWorldSize(12, zoom, 8, 18, readabilityScale)

  const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
  if (!layoutBounds) return
  const dataRoutes = layout.project.dataRoutes ?? []
  const forcePortLabelsBottom = layout.project.overview.forcePortLabelsBottom ?? false
  let maxPortLabelWidthLeft = 0
  let maxPortLabelWidthRight = 0
  let maxPortLabelBottom: number | null = null

  if (dataRoutes.length > 0) {
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

    let hasBottomLabel = false
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

      const explicitPosition = route.labelPosition && route.labelPosition !== "auto" ? route.labelPosition : null
      let resolvedPosition: "bottom" | "side" | "top" | "left" | "right"
      if (explicitPosition) {
        resolvedPosition = explicitPosition
      } else if (route.forcePortLabelBottom ?? forcePortLabelsBottom) {
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
        hasBottomLabel = true
        break
      }
    }

    if (hasBottomLabel) {
      const dataFontSize = scaledReadableWorldSize(14, zoom, 12, 18, readabilityScale)
      const dataLabelPadding = scaledReadableWorldSize(8, zoom, 6, 12, readabilityScale)
      const dataLabelHeight = dataFontSize + dataLabelPadding * 1.6
      const dataLabelOffset = getPortLabelOffset(90 * readabilityScale, dataLabelHeight)
      maxPortLabelBottom = layoutBounds.maxY + dataLabelOffset + dataLabelHeight / 2
    }
  }

  if (dataRoutes.length > 0) {
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

    const dataFontSize = scaledReadableWorldSize(14, zoom, 12, 18, readabilityScale)
    const dataLabelPadding = scaledReadableWorldSize(8, zoom, 6, 12, readabilityScale)
    const dataLabelOffset = 90

    dataRoutes.forEach((route) => {
      if (route.cabinetIds.length === 0) return
      const firstEndpoint = route.cabinetIds.find((endpointId) => {
        const { cabinetId } = parseRouteCabinetId(endpointId)
        const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
        if (!cabinet) return false
        return !!getCabinetBounds(cabinet, layout.cabinetTypes)
      })
      if (!firstEndpoint) return

      const { cabinetId, cardIndex } = parseRouteCabinetId(firstEndpoint)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const anchorPoint = getCabinetDataAnchorPoint(cabinet, bounds, zoom, cardIndex, readabilityScale)
      const anchor = { connectorX: anchorPoint.x, connectorY: anchorPoint.y }

      const labelText = `Port ${route.port}`
      ctx.font = `bold ${dataFontSize}px ${FONT_FAMILY}`
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
        void labelCenterX
        void labelCenterY
      }
    })
  }

  const layoutMidY = (layoutBounds.minY + layoutBounds.maxY) / 2
  const labelGap = scaledReadableWorldSize(14, zoom, 10, 22, readabilityScale)
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

  powerFeeds.forEach((feed) => {
    if (feed.assignedCabinetIds.length === 0) return
    const feedSteps = getPowerSteps(feed)
    const points: { x: number; y: number }[] = []
    feedSteps.forEach((step) => {
      if (step.type === "point") {
        points.push({ x: step.x_mm, y: step.y_mm })
        return
      }
      const cabinet = layout.cabinets.find((c) => c.id === step.endpointId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, zoom, cardCount, readabilityScale)
      let anchorX = bounds.x + bounds.width / 2
      let anchorY = bounds.y + bounds.height / 2
      if (rects.length > 0) {
        const anchorRect =
          rects.length === 1 ? rects[0] : bounds.y + bounds.height / 2 > layoutMidY ? rects[1] : rects[0]
        const anchor = getPowerAnchorPoint(anchorRect, bounds, zoom, readabilityScale)
        anchorX = anchor.x
        anchorY = anchor.y
      }
      points.push({ x: anchorX, y: anchorY })
    })
    if (points.length === 0) return

    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const loadW = getPowerFeedLoadW(feed, layout.cabinets, layout.cabinetTypes)
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.connector
    const maxTextWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(connectorText).width)
    const boxWidth = maxTextWidth + labelPaddingX * 2
    const labelPosition = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : "bottom"
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

    const isOverloaded = isPowerFeedOverloaded(feed, layout.cabinets, layout.cabinetTypes)
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
      cardRect?: CardRect
    }[] = []
    feedSteps.forEach((step) => {
      if (step.type === "point") {
        points.push({ x: step.x_mm, y: step.y_mm, bounds: null })
        return
      }
      const cabinet = layout.cabinets.find((c) => c.id === step.endpointId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, zoom, cardCount, readabilityScale)
      let anchorX = bounds.x + bounds.width / 2
      let anchorY = bounds.y + bounds.height / 2
      let anchorRect: CardRect | undefined
      if (rects.length > 0) {
        anchorRect = rects.length === 1 ? rects[0] : bounds.y + bounds.height / 2 > layoutMidY ? rects[1] : rects[0]
        const anchor = getPowerAnchorPoint(anchorRect, bounds, zoom, readabilityScale)
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
      layout.cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
      layout.cabinetTypes,
    )
    if (!feedBounds) {
      ctx.restore()
      return
    }

    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const loadW = getPowerFeedLoadW(feed, layout.cabinets, layout.cabinetTypes)
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.connector

    const maxTextWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(connectorText).width)
    const boxWidth = maxTextWidth + labelPaddingX * 2
    const boxHeight = fontSize * 2.4 + labelPaddingY * 2
    const labelOffset = getPowerLabelOffset(baseLabelOffset, boxHeight)
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
        const minLabelTop = maxPortLabelBottom + scaledReadableWorldSize(16, zoom, 10, 22, readabilityScale)
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

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)"
    ctx.strokeStyle = lineColor
    ctx.lineWidth = scaledReadableWorldSize(2, zoom, 1.5, 3, readabilityScale)
    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, labelRadius)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    ctx.fillText(labelText, labelCenterX, boxY + labelPaddingY)
    ctx.font = `${fontSize * 0.85}px ${FONT_FAMILY}`
    ctx.fillText(connectorText, labelCenterX, boxY + labelPaddingY + fontSize * 1.05)

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

    drawLabelConnector(outlineColor, outlineWidth)
    drawLabelConnector(lineColor, lineWidth)

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
          const dx = curr.x - prev.x
          const dy = curr.y - prev.y
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)

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

          if (absDx < 10 || absDy < 10) {
            ctx.lineTo(curr.x, curr.y)
            continue
          }

          // Turn at the destination cabinet to keep routing tight to the path.
          ctx.lineTo(prev.x, curr.y)
          ctx.lineTo(curr.x, curr.y)
        }
        ctx.stroke()
      }

      drawFeedConnections(outlineColor, outlineWidth)
      drawFeedConnections(lineColor, lineWidth)
    }

    if (points.length > 0) {
      const lastPoint = points[points.length - 1]
      const secondLast = points.length > 1 ? points[points.length - 2] : { x: labelLineX, y: labelLineY }
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

      ctx.strokeStyle = outlineColor
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
      ctx.strokeStyle = outlineColor
      ctx.lineWidth = scaledReadableWorldSize(1.2, zoom, 0.8, 1.8, readabilityScale)
      ctx.stroke()
      ctx.fillStyle = lineColor
      ctx.fill()

      ctx.strokeStyle = outlineColor
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
  label: string,
  layout: LayoutData,
  zoom: number,
  minY?: number,
  readabilityScale = 1,
) {
  const bounds = getLayoutBounds(layout)
  if (bounds.width === 0 && bounds.height === 0) return

  const { minX, maxX, maxY } = bounds
  const boxWidth = scaledReadableWorldSize(120, zoom, 100, 160, readabilityScale)
  const boxHeight = scaledReadableWorldSize(40, zoom, 32, 60, readabilityScale)
  const fontSize = scaledReadableWorldSize(11, zoom, 10, 14, readabilityScale)

  const boxX = (minX + maxX) / 2 - boxWidth / 2
  const baseY = maxY + scaledReadableWorldSize(100, zoom, 70, 160, readabilityScale)
  const boxY = Math.max(baseY, minY ?? baseY)

  ctx.save()
  ctx.fillStyle = "#1e293b"
  ctx.strokeStyle = "#475569"
  ctx.lineWidth = scaledReadableWorldSize(2, zoom, 1.5, 3, readabilityScale)
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, boxX + boxWidth / 2, boxY + boxHeight / 2)
  ctx.restore()
}

export function drawOverview(ctx: CanvasRenderingContext2D, layout: LayoutData, options: OverviewRenderOptions) {
  const palette = { ...DEFAULT_PALETTE, ...options.palette }
  const { zoom, panX, panY, viewportWidth, viewportHeight } = options
  const uiScale = options.uiScale ?? 1
  const uiZoom = zoom / uiScale
  const readabilityScale = options.readabilityScale ?? 1
  const errors = validateLayout(layout)
  const errorCabinetIds = new Set(errors.filter((e) => e.type === "error").flatMap((e) => e.cabinetIds))

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, viewportWidth, viewportHeight)

  ctx.save()
  ctx.translate(panX, panY)
  ctx.scale(zoom, zoom)

  if (options.showGrid && layout.project.grid.enabled) {
    const step = layout.project.grid.step_mm
    ctx.strokeStyle = palette.gridLine
    ctx.lineWidth = 1 / uiZoom

    const startX = Math.floor(-panX / zoom / step) * step - step
    const startY = Math.floor(-panY / zoom / step) * step - step
    const endX = Math.ceil((viewportWidth - panX) / zoom / step) * step + step
    const endY = Math.ceil((viewportHeight - panY) / zoom / step) * step + step

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

  if (options.showOrigin) {
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 2 / uiZoom
    ctx.beginPath()
    ctx.moveTo(-20, 0)
    ctx.lineTo(60, 0)
    ctx.moveTo(0, -20)
    ctx.lineTo(0, 60)
    ctx.stroke()
  }

  const showCabinetLabels = options.showCabinetLabels ?? layout.project.overview.showCabinetLabels ?? true
  const gridLabelAxis = layout.project.overview.gridLabelAxis ?? "columns"
  const showGridLabels = showCabinetLabels && shouldShowGridLabels(options.labelsMode)
  const receiverCardModel = layout.project.overview.receiverCardModel
  const showReceiverCards = (options.showReceiverCards ?? true) && (layout.project.overview.showReceiverCards ?? true)
  const showDataRoutes = (options.showDataRoutes ?? true) && (layout.project.overview.showDataRoutes ?? true)
  const showPowerRoutes = (options.showPowerRoutes ?? true) && (layout.project.overview.showPowerRoutes ?? true)
  const showModuleGrid = (options.showModuleGrid ?? true) && (layout.project.overview.showModuleGrid ?? true)
  const mappingNumbers = layout.project.overview.mappingNumbers
  const showMappingNumbers = (options.showMappingNumbers ?? true) && (mappingNumbers?.show ?? false)
  const forcePortLabelsBottom =
    options.forcePortLabelsBottom ?? layout.project.overview.forcePortLabelsBottom ?? false
  const moduleSize = layout.project.overview.moduleSize
  const moduleOrientation = layout.project.overview.moduleOrientation
  const baseModule = moduleSize === "160x160" ? { width: 160, height: 160 } : { width: 320, height: 160 }
  const moduleWidth = moduleOrientation === "portrait" ? baseModule.height : baseModule.width
  const moduleHeight = moduleOrientation === "portrait" ? baseModule.width : baseModule.height
  const moduleGridBounds = showModuleGrid ? getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes) : null
  const moduleGridOrigin = moduleGridBounds ? { x: moduleGridBounds.minX, y: moduleGridBounds.minY } : null
  const controllerPlacement = layout.project.controllerPlacement ?? "external"
  const controllerCabinetId = layout.project.controllerCabinetId
  const controllerInCabinet =
    controllerPlacement === "cabinet" &&
    !!controllerCabinetId &&
    layout.cabinets.some((cabinet) => cabinet.id === controllerCabinetId)

  layout.cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return

    const isSelected = cabinet.id === options.selectedCabinetId
    const hasError = errorCabinetIds.has(cabinet.id)

    let fillStart = hasError ? palette.cabinetErrorFill : palette.cabinetFill
    let fillEnd = hasError ? palette.cabinetErrorFill : palette.cabinetFillAlt
    let strokeColor = hasError ? palette.cabinetErrorStroke : palette.cabinetStroke
    if (isSelected) {
      fillStart = palette.cabinetSelected
      fillEnd = palette.cabinetSelected
      strokeColor = palette.cabinetSelected
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
      ctx.strokeStyle = palette.moduleGridLine
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
    ctx.lineWidth = isSelected ? 3 / uiZoom : 2 / uiZoom
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

  })

  if (showDataRoutes) {
    drawDataRoutes(
      ctx,
      layout,
      uiZoom,
      showReceiverCards,
      receiverCardModel,
      forcePortLabelsBottom,
      readabilityScale,
    )
  }

  if (showPowerRoutes) {
    drawPowerFeeds(ctx, layout, uiZoom, readabilityScale)
  }

  layout.cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return

    const fontSize = Math.max(12 * readabilityScale, (14 * readabilityScale) / uiZoom)
    const smallFontSize = Math.max(9 * readabilityScale, (10 * readabilityScale) / uiZoom)

    if (showCabinetLabels && options.labelsMode === "internal") {
      ctx.fillStyle = palette.labelPrimary
      ctx.font = `${fontSize}px ${FONT_FAMILY}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(cabinet.id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)
    }

    if (controllerPlacement === "cabinet" && controllerCabinetId === cabinet.id) {
      const controllerLabel = layout.project.controllerLabel?.trim() || layout.project.controller
      drawControllerBadge(ctx, bounds, controllerLabel, uiZoom, readabilityScale)
    }

    ctx.fillStyle = palette.labelSecondary
    ctx.font = `600 ${smallFontSize}px ${FONT_FAMILY}`
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    const sizeLabel = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    const sizeLabelInset = (6 * readabilityScale) / uiZoom
    ctx.fillText(sizeLabel, bounds.x + bounds.width - sizeLabelInset, bounds.y + bounds.height - sizeLabelInset)
  })

  if (showReceiverCards) {
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const receiverLabel = getReceiverCardLabel(layout, cabinet)
      if (!receiverLabel) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, uiZoom, cardCount, readabilityScale)
      rects.forEach((rect) => {
        drawReceiverCard(ctx, rect, receiverLabel, uiZoom, palette, readabilityScale)
        drawPowerAnchorDot(ctx, rect, bounds, uiZoom, "#f97316", readabilityScale)
      })
    })
  }

  if (showMappingNumbers) {
    drawMappingNumbers(ctx, layout, uiZoom, mappingNumbers, moduleWidth, moduleHeight, moduleGridOrigin)
  }

  if (showGridLabels) {
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const label = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes, gridLabelAxis)
      const labelFontSize = Math.max(11 * readabilityScale, (13 * readabilityScale) / uiZoom)
      ctx.font = `bold ${labelFontSize}px ${FONT_FAMILY}`
      const textWidth = ctx.measureText(label).width
      const pad = (4 * readabilityScale) / uiZoom
      const boxX = bounds.x + pad
      const boxY = bounds.y + pad
      const boxW = textWidth + (8 * readabilityScale) / uiZoom
      const boxH = labelFontSize + (6 * readabilityScale) / uiZoom

      ctx.fillStyle = "#f59e0b"
      ctx.fillRect(boxX, boxY, boxW, boxH)
      ctx.fillStyle = "#000000"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(label, boxX + (4 * readabilityScale) / uiZoom, boxY + (3 * readabilityScale) / uiZoom)
    })
  }

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
      if (showDataRoutes && layout.project.dataRoutes.length > 0) {
        const fontSize = scaledReadableWorldSize(14, uiZoom, 12, 18, readabilityScale)
        const labelPadding = scaledReadableWorldSize(8, uiZoom, 6, 12, readabilityScale)
        const labelHeight = fontSize + labelPadding * 1.6
        const labelOffset = getPortLabelOffset(90 * readabilityScale, labelHeight)

        for (const route of layout.project.dataRoutes) {
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
      if (showPowerRoutes && layout.project.powerFeeds.length > 0) {
        const fontSize = scaledReadableWorldSize(14, uiZoom, 12, 18, readabilityScale)
        const labelPaddingY = scaledReadableWorldSize(6, uiZoom, 4, 9, readabilityScale)
        const boxHeight = fontSize * 2.4 + labelPaddingY * 2
        const labelOffset = getPowerLabelOffset(140 * readabilityScale, boxHeight)

        layout.project.powerFeeds.forEach((feed) => {
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

      const clearance = scaledReadableWorldSize(24, uiZoom, 16, 40, readabilityScale)
      const controllerMinY = Math.max(
        layoutBounds.maxY + scaledReadableWorldSize(120, uiZoom, 80, 200, readabilityScale),
        (dataPortBottom ?? -Infinity) + clearance,
        (powerLabelBottom ?? -Infinity) + clearance,
      )
      const controllerLabel = layout.project.controllerLabel?.trim() || layout.project.controller
      drawControllerPorts(ctx, controllerLabel, layout, uiZoom, controllerMinY, readabilityScale)
    }
  }

  if (options.showDimensions) {
    const baseOffset = options.dimensionOffsetMm ?? 40
    let sideOffset = baseOffset
    if (showDataRoutes) {
      const extents = getDataRouteLabelExtents(ctx, layout, uiZoom, forcePortLabelsBottom, readabilityScale)
      const bounds = getLayoutBounds(layout)
      const clearance = scaledReadableWorldSize(18, uiZoom, 12, 28, readabilityScale)
      if (extents) {
        if ((options.dimensionSide ?? "left") === "right") {
          const needed = extents.maxX - bounds.maxX + clearance
          if (needed > sideOffset) sideOffset = needed
        } else {
          const needed = bounds.minX - extents.minX + clearance
          if (needed > sideOffset) sideOffset = needed
        }
      }
    }
    drawDimensionLines(
      ctx,
      layout,
      uiZoom,
      palette,
      options.showPixels,
      baseOffset,
      sideOffset,
      options.dimensionSide,
      readabilityScale,
    )
  }

  ctx.restore()
}
