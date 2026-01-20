import type { LayoutData, LabelsMode, Cabinet, CabinetType } from "./types"
import { computeGridLabel, getCabinetReceiverCardCount, parseRouteCabinetId } from "./types"
import { isDataRouteOverCapacity } from "./data-utils"
import { getPowerFeedLoadW, isPowerFeedOverloaded } from "./power-utils"
import { getCabinetBounds, getLayoutBounds, validateLayout } from "./validation"
import { getLayoutPixelDimensions, getReceiverCardLabel, shouldShowGridLabels } from "./overview-utils"

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
  showDimensions: boolean
  showPixels: boolean
  showReceiverCards: boolean
  showDataRoutes: boolean
  showPowerRoutes: boolean
  showModuleGrid: boolean
  uiScale?: number
  dimensionOffsetMm?: number
  dimensionSide?: "left" | "right"
  forcePortLabelsBottom?: boolean
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
  offsetMm = 40,
  side: "left" | "right" = "left",
) {
  const bounds = getLayoutBounds(layout)
  if (bounds.width === 0 || bounds.height === 0) return

  const offset = offsetMm
  const fontSize = Math.max(11, 14 / zoom)
  ctx.strokeStyle = palette.dimensionLine
  ctx.fillStyle = palette.dimensionText
  ctx.lineWidth = 1.5 / zoom
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const topY = bounds.minY - offset
  const leftX = bounds.minX - offset
  const rightX = bounds.maxX + offset

  // Horizontal dimension
  ctx.beginPath()
  ctx.moveTo(bounds.minX, topY)
  ctx.lineTo(bounds.maxX, topY)
  ctx.stroke()
  ctx.beginPath()
  ctx.stroke()
  drawArrow(ctx, bounds.minX, topY, Math.PI, 7 / zoom)
  drawArrow(ctx, bounds.maxX, topY, 0, 7 / zoom)

  // Vertical dimension
  const dimX = side === "right" ? rightX : leftX
  ctx.beginPath()
  ctx.moveTo(dimX, bounds.minY)
  ctx.lineTo(dimX, bounds.maxY)
  ctx.stroke()
  ctx.beginPath()
  ctx.stroke()
  drawArrow(ctx, dimX, bounds.minY, -Math.PI / 2, 7 / zoom)
  drawArrow(ctx, dimX, bounds.maxY, Math.PI / 2, 7 / zoom)

  const pixels = getLayoutPixelDimensions(layout)
  const widthLabel = showPixels && pixels.width_px
    ? `${bounds.width} mm / ${pixels.width_px} px`
    : `${bounds.width} mm`
  const heightLabel = showPixels && pixels.height_px
    ? `${bounds.height} mm / ${pixels.height_px} px`
    : `${bounds.height} mm`

  ctx.fillText(widthLabel, bounds.minX + bounds.width / 2, topY - 10 / zoom)

  ctx.save()
  const textOffset = side === "right" ? 10 / zoom : -10 / zoom
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
): CardRect[] {
  if (count <= 0) return []
  const minWidth = 48 / zoom
  const maxWidth = 84 / zoom
  const minHeight = 12 / zoom
  const maxHeight = 18 / zoom
  const cardWidth = Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
  const cardHeight = Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
  const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
  const cardY = bounds.y + bounds.height / 2 - cardHeight / 2

  if (count === 1) {
    return [{ x: cardX, y: cardY, width: cardWidth, height: cardHeight }]
  }

  const gap = Math.min(10 / zoom, cardHeight)
  const totalHeight = cardHeight * 2 + gap
  const startY = bounds.y + bounds.height / 2 - totalHeight / 2
  return [
    { x: cardX, y: startY, width: cardWidth, height: cardHeight },
    { x: cardX, y: startY + cardHeight + gap, width: cardWidth, height: cardHeight },
  ]
}

function getReceiverCardRect(bounds: { x: number; y: number; width: number; height: number }, zoom: number) {
  return getReceiverCardRects(bounds, zoom, 1)[0]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function scaledWorldSize(basePx: number, zoom: number, minPx: number, maxPx: number) {
  const sizePx = clamp(basePx * zoom, minPx, maxPx)
  return sizePx / zoom
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

function getPowerAnchorPoint(cardRect: CardRect, zoom: number) {
  const anchorOffset = 6 / zoom
  return { x: cardRect.x - anchorOffset, y: cardRect.y + cardRect.height / 2 }
}

function drawPowerAnchorDot(ctx: CanvasRenderingContext2D, cardRect: CardRect, zoom: number, color: string) {
  const { x, y } = getPowerAnchorPoint(cardRect, zoom)
  const radius = 3.2 / zoom
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
) {
  const { x, y, width, height } = rect
  const fontSize = 8 / zoom
  const padding = 4 / zoom
  const connectorX = x + width / 2
  const connectorY = y + height + 6 / zoom

  ctx.save()
  ctx.shadowColor = "rgba(15, 23, 42, 0.15)"
  ctx.shadowBlur = 6 / zoom
  ctx.shadowOffsetY = 2 / zoom
  ctx.fillStyle = palette.receiverCardFill
  ctx.fillRect(x, y, width, height)
  ctx.restore()

  ctx.strokeStyle = palette.receiverCardStroke
  ctx.lineWidth = 1 / zoom
  ctx.strokeRect(x, y, width, height)

  ctx.fillStyle = palette.receiverCardStroke
  ctx.fillRect(x + 1 / zoom, y + 1 / zoom, width - 2 / zoom, 2 / zoom)

  ctx.fillStyle = palette.receiverCardText
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const fitted = fitTextToWidth(ctx, model, width - padding * 2)
  ctx.fillText(fitted, x + width / 2, y + height / 2)

  ctx.fillStyle = "#3b82f6"
  ctx.beginPath()
  ctx.arc(connectorX, connectorY, 3.2 / zoom, 0, Math.PI * 2)
  ctx.fill()
}

function drawDataRoutes(
  ctx: CanvasRenderingContext2D,
  layout: LayoutData,
  zoom: number,
  showReceiverCards: boolean,
  receiverCardModel: string,
  forcePortLabelsBottom = false,
) {
  const { dataRoutes, pitch_mm } = layout.project
  if (!dataRoutes || dataRoutes.length === 0) return

  const lineWidth = scaledWorldSize(5, zoom, 3, 9)
  const outlineWidth = lineWidth + scaledWorldSize(0.9, zoom, 0.6, 1.6)
  const outlineColor = "rgba(15, 23, 42, 0.2)"
  const arrowSize = scaledWorldSize(12, zoom, 8, 20)
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPadding = scaledWorldSize(8, zoom, 6, 12)
  const labelRadius = scaledWorldSize(6, zoom, 4, 10)
  const labelOffset = 90
  const labelSideGap = scaledWorldSize(60, zoom, 40, 90)

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
    if (route.cabinetIds.length === 0) return

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
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>>
      hasReceiverCard: boolean
    }[] = []

    route.cabinetIds.forEach((endpointId) => {
      const { cabinetId, cardIndex } = parseRouteCabinetId(endpointId)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      if (cardCount === 0) return
      const rects = getReceiverCardRects(bounds, zoom, cardCount)
      const resolvedIndex = cardIndex === undefined ? 0 : Math.max(0, Math.min(rects.length - 1, cardIndex))
      const anchorRect = rects[resolvedIndex]
      const hasReceiverCard = showReceiverCards && !!getReceiverCardLabel(layout, cabinet)
      const anchor = anchorRect
        ? { connectorX: anchorRect.x + anchorRect.width / 2, connectorY: anchorRect.y + anchorRect.height + 6 / zoom }
        : { connectorX: bounds.x + bounds.width / 2, connectorY: bounds.y + bounds.height / 2 }
      points.push({
        x: anchor.connectorX,
        y: anchor.connectorY,
        bounds,
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
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const labelWidth = ctx.measureText(portLabel).width + labelPadding * 2
    const labelHeight = fontSize + labelPadding * 1.6
    const portLabelCenterY = firstPoint.y

    let placeLeft = false
    if (!forcePortLabelsBottom && firstBounds && rowCenters.length > 1) {
      const centerY = firstBounds.y + firstBounds.height / 2
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

    const portLabelX = placeLeft
      ? (firstBounds?.x ?? firstPoint.x) - labelSideGap - labelWidth / 2
      : firstPoint.x
    const portLabelY = placeLeft ? portLabelCenterY : maxY + labelOffset
    const labelBoxY = placeLeft ? portLabelCenterY - labelHeight / 2 : portLabelY - labelHeight / 2

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

    const lineStartX = placeLeft ? portLabelX + labelWidth / 2 : portLabelX
    const lineStartY = placeLeft ? portLabelCenterY : portLabelY - labelHeight / 2
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
      ctx.strokeStyle = outlineColor
      ctx.lineWidth = outlineWidth
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const midY = (prev.y + curr.y) / 2
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else {
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
        const midY = (prev.y + curr.y) / 2
        const dx = Math.abs(curr.x - prev.x)
        const dy = Math.abs(curr.y - prev.y)

        if (dy < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else if (dx < 10) {
          ctx.lineTo(curr.x, curr.y)
        } else {
          ctx.lineTo(prev.x, midY)
          ctx.lineTo(curr.x, midY)
          ctx.lineTo(curr.x, curr.y)
        }
      }
      ctx.stroke()

      const lastPoint = points[points.length - 1]
      const secondLast = points[points.length - 2]

      if (!lastPoint.hasReceiverCard) {
        let angle: number
        if (Math.abs(lastPoint.x - secondLast.x) < 10) {
          angle = lastPoint.y > secondLast.y ? Math.PI / 2 : -Math.PI / 2
        } else {
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
        ctx.strokeStyle = outlineColor
        ctx.lineWidth = scaledWorldSize(1.2, zoom, 0.8, 1.8)
        ctx.stroke()
        ctx.fillStyle = lineColor
        ctx.fill()
      }
    }

    ctx.restore()
  })
}

function drawPowerFeeds(ctx: CanvasRenderingContext2D, layout: LayoutData, zoom: number) {
  const { powerFeeds } = layout.project
  if (!powerFeeds || powerFeeds.length === 0) return

  const lineWidth = scaledWorldSize(5.5, zoom, 3, 9.5)
  const outlineWidth = lineWidth + scaledWorldSize(0.9, zoom, 0.6, 1.6)
  const outlineColor = "rgba(15, 23, 42, 0.2)"
  const fontSize = scaledWorldSize(14, zoom, 12, 18)
  const labelPaddingX = scaledWorldSize(9, zoom, 6, 13)
  const labelPaddingY = scaledWorldSize(6, zoom, 4, 9)
  const labelRadius = scaledWorldSize(7, zoom, 4.5, 11)
  const labelOffset = 140
  const breakBarSize = scaledWorldSize(14, zoom, 10, 20)
  const breakStemSize = scaledWorldSize(10, zoom, 7, 16)
  const breakHeadSize = scaledWorldSize(12, zoom, 8, 18)

  const layoutBounds = getLayoutBoundsFromCabinets(layout.cabinets, layout.cabinetTypes)
  if (!layoutBounds) return
  const dataRoutes = layout.project.dataRoutes ?? []
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
        return getCabinetReceiverCardCount(cabinet) > 0
      })
      if (!firstEndpoint) continue

      const { cabinetId } = parseRouteCabinetId(firstEndpoint)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) continue
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) continue

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

      if (!placeLeft) {
        hasBottomLabel = true
        break
      }
    }

    if (hasBottomLabel) {
      const dataFontSize = scaledWorldSize(14, zoom, 12, 18)
      const dataLabelPadding = scaledWorldSize(8, zoom, 6, 12)
      const dataLabelHeight = dataFontSize + dataLabelPadding * 1.6
      const dataLabelOffset = 90
      maxPortLabelBottom = layoutBounds.maxY + dataLabelOffset + dataLabelHeight / 2
    }
  }

  const layoutMidY = (layoutBounds.minY + layoutBounds.maxY) / 2
  const rowEdges = layout.cabinets
    .map((cabinet) => getCabinetBounds(cabinet, layout.cabinetTypes))
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

    const points: {
      x: number
      y: number
      bounds: NonNullable<ReturnType<typeof getCabinetBounds>>
      cardRect?: CardRect
    }[] = []
    feed.assignedCabinetIds.forEach((id) => {
      const cabinet = layout.cabinets.find((c) => c.id === id)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, zoom, cardCount)
      let anchorX = bounds.x + bounds.width / 2
      let anchorY = bounds.y + bounds.height / 2
      let anchorRect: CardRect | undefined
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
      layout.cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id)),
      layout.cabinetTypes,
    )
    if (!feedBounds) {
      ctx.restore()
      return
    }

    let labelY = feedBounds.maxY + labelOffset
    if (maxPortLabelBottom !== null) {
      const minLabelY = maxPortLabelBottom + scaledWorldSize(16, zoom, 10, 22)
      labelY = Math.max(labelY, minLabelY)
    }

    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const loadW = getPowerFeedLoadW(feed, layout.cabinets, layout.cabinetTypes)
    const breakerText = feed.breaker || feed.label
    const labelText = `${breakerText} | ${loadW}W`
    const connectorText = feed.connector

    const maxTextWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(connectorText).width)
    const boxWidth = maxTextWidth + labelPaddingX * 2
    const boxHeight = fontSize * 2.4 + labelPaddingY * 2
    const boxX = points[0].x

    ctx.fillStyle = "rgba(15, 23, 42, 0.95)"
    ctx.strokeStyle = lineColor
    ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
    drawRoundedRect(ctx, boxX - boxWidth / 2, labelY, boxWidth, boxHeight, labelRadius)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = "#ffffff"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    ctx.fillText(labelText, boxX, labelY + labelPaddingY)
    ctx.font = `${fontSize * 0.85}px ${FONT_FAMILY}`
    ctx.fillText(connectorText, boxX, labelY + labelPaddingY + fontSize * 1.05)

    ctx.strokeStyle = outlineColor
    ctx.lineWidth = outlineWidth
    ctx.beginPath()
    ctx.moveTo(boxX, labelY)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()

    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(boxX, labelY)
    ctx.lineTo(points[0].x, points[0].y)
    ctx.stroke()

    if (points.length > 1) {
      const rowGap = scaledWorldSize(30, zoom, 18, 30)
      ctx.strokeStyle = outlineColor
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
      const secondLast = points.length > 1 ? points[points.length - 2] : { x: boxX, y: labelY }
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
      ctx.lineWidth = scaledWorldSize(1.2, zoom, 0.8, 1.8)
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
  controller: "A100" | "A200",
  layout: LayoutData,
  zoom: number,
) {
  const bounds = getLayoutBounds(layout)
  if (bounds.width === 0 && bounds.height === 0) return

  const { minX, maxX, maxY } = bounds
  const boxWidth = scaledWorldSize(120, zoom, 100, 160)
  const boxHeight = scaledWorldSize(40, zoom, 32, 60)
  const fontSize = scaledWorldSize(11, zoom, 10, 14)

  const boxX = (minX + maxX) / 2 - boxWidth / 2
  const boxY = maxY + scaledWorldSize(100, zoom, 70, 160)

  ctx.save()
  ctx.fillStyle = "#1e293b"
  ctx.strokeStyle = "#475569"
  ctx.lineWidth = scaledWorldSize(2, zoom, 1.5, 3)
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(controller, boxX + boxWidth / 2, boxY + boxHeight / 2)
  ctx.restore()
}

export function drawOverview(ctx: CanvasRenderingContext2D, layout: LayoutData, options: OverviewRenderOptions) {
  const palette = { ...DEFAULT_PALETTE, ...options.palette }
  const { zoom, panX, panY, viewportWidth, viewportHeight } = options
  const uiScale = options.uiScale ?? 1
  const uiZoom = zoom / uiScale
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

  const showGridLabels = shouldShowGridLabels(options.labelsMode)
  const receiverCardModel = layout.project.overview.receiverCardModel
  const showReceiverCards = (options.showReceiverCards ?? true) && (layout.project.overview.showReceiverCards ?? true)
  const showDataRoutes = (options.showDataRoutes ?? true) && (layout.project.overview.showDataRoutes ?? true)
  const showPowerRoutes = (options.showPowerRoutes ?? true) && (layout.project.overview.showPowerRoutes ?? true)
  const showModuleGrid = (options.showModuleGrid ?? true) && (layout.project.overview.showModuleGrid ?? true)
  const moduleSize = layout.project.overview.moduleSize
  const moduleOrientation = layout.project.overview.moduleOrientation
  const baseModule = moduleSize === "160x160" ? { width: 160, height: 160 } : { width: 320, height: 160 }
  const moduleWidth = moduleOrientation === "portrait" ? baseModule.height : baseModule.width
  const moduleHeight = moduleOrientation === "portrait" ? baseModule.width : baseModule.height

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

    if (showModuleGrid && moduleWidth > 0 && moduleHeight > 0) {
      ctx.save()
      const inset = 1 / uiZoom
      ctx.beginPath()
      ctx.rect(bounds.x + inset, bounds.y + inset, bounds.width - inset * 2, bounds.height - inset * 2)
      ctx.clip()
      ctx.strokeStyle = palette.moduleGridLine
      ctx.lineWidth = Math.max(0.8 / uiZoom, 0.6 / uiZoom)
      ctx.beginPath()
      for (let x = bounds.x + moduleWidth; x < bounds.x + bounds.width - inset; x += moduleWidth) {
        ctx.moveTo(x, bounds.y + inset)
        ctx.lineTo(x, bounds.y + bounds.height - inset)
      }
      for (let y = bounds.y + moduleHeight; y < bounds.y + bounds.height - inset; y += moduleHeight) {
        ctx.moveTo(bounds.x + inset, y)
        ctx.lineTo(bounds.x + bounds.width - inset, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = isSelected ? 3 / uiZoom : 2 / uiZoom
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

    const fontSize = Math.max(12, 14 / uiZoom)
    const smallFontSize = Math.max(9, 10 / uiZoom)

    if (options.labelsMode === "internal") {
      ctx.fillStyle = palette.labelPrimary
      ctx.font = `${fontSize}px ${FONT_FAMILY}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(cabinet.id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)
    }

    ctx.fillStyle = palette.labelSecondary
    ctx.font = `${smallFontSize}px ${FONT_FAMILY}`
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(
      cabinet.typeId.replace("STD_", ""),
      bounds.x + bounds.width - 6 / uiZoom,
      bounds.y + bounds.height - 6 / uiZoom,
    )

  })

  if (showDataRoutes) {
    drawDataRoutes(
      ctx,
      layout,
      uiZoom,
      showReceiverCards,
      receiverCardModel,
      options.forcePortLabelsBottom ?? false,
    )
  }

  if (showPowerRoutes) {
    drawPowerFeeds(ctx, layout, uiZoom)
  }

  if (showReceiverCards) {
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const receiverLabel = getReceiverCardLabel(layout, cabinet)
      if (!receiverLabel) return
      const cardCount = getCabinetReceiverCardCount(cabinet)
      const rects = getReceiverCardRects(bounds, uiZoom, cardCount)
      rects.forEach((rect) => {
        drawReceiverCard(ctx, rect, receiverLabel, uiZoom, palette)
        drawPowerAnchorDot(ctx, rect, uiZoom, "#f97316")
      })
    })
  }

  if (showGridLabels) {
    layout.cabinets.forEach((cabinet) => {
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const label = computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes)
      const labelFontSize = Math.max(11, 13 / uiZoom)
      ctx.font = `bold ${labelFontSize}px ${FONT_FAMILY}`
      const textWidth = ctx.measureText(label).width
      const pad = 4 / uiZoom
      const boxX = bounds.x + pad
      const boxY = bounds.y + pad
      const boxW = textWidth + 8 / uiZoom
      const boxH = labelFontSize + 6 / uiZoom

      ctx.fillStyle = "#f59e0b"
      ctx.fillRect(boxX, boxY, boxW, boxH)
      ctx.fillStyle = "#000000"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(label, boxX + 4 / uiZoom, boxY + 3 / uiZoom)
    })
  }

  if (layout.cabinets.length > 0) {
    drawControllerPorts(ctx, layout.project.controller, layout, uiZoom)
  }

  if (options.showDimensions) {
    drawDimensionLines(
      ctx,
      layout,
      uiZoom,
      palette,
      options.showPixels,
      options.dimensionOffsetMm,
      options.dimensionSide,
    )
  }

  ctx.restore()
}
