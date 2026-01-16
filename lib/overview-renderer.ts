import type { LayoutData, LabelsMode } from "./types"
import { getCabinetBounds, getLayoutBounds, validateLayout } from "./validation"
import { getGridLabelMap, getLayoutPixelDimensions, getReceiverCardLabel, shouldShowGridLabels } from "./overview-utils"

export interface OverviewPalette {
  background: string
  gridLine: string
  cabinetFill: string
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
  selectedCabinetId?: string | null
  palette?: Partial<OverviewPalette>
}

const DEFAULT_PALETTE: OverviewPalette = {
  background: "#111111",
  gridLine: "#333333",
  cabinetFill: "rgba(56, 189, 248, 0.15)",
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
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, size / 2)
  ctx.lineTo(-size, -size / 2)
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
) {
  const bounds = getLayoutBounds(layout)
  if (bounds.width === 0 || bounds.height === 0) return

  const offset = 40
  const tick = 10
  const fontSize = Math.max(10, 12 / zoom)
  ctx.strokeStyle = palette.dimensionLine
  ctx.fillStyle = palette.dimensionText
  ctx.lineWidth = 1.5 / zoom
  ctx.font = `${fontSize}px Geist Mono, monospace`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const topY = bounds.minY - offset
  const leftX = bounds.minX - offset

  // Horizontal dimension
  ctx.beginPath()
  ctx.moveTo(bounds.minX, topY)
  ctx.lineTo(bounds.maxX, topY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bounds.minX, topY - tick / 2)
  ctx.lineTo(bounds.minX, topY + tick / 2)
  ctx.moveTo(bounds.maxX, topY - tick / 2)
  ctx.lineTo(bounds.maxX, topY + tick / 2)
  ctx.stroke()
  drawArrow(ctx, bounds.minX, topY, Math.PI, 6 / zoom)
  drawArrow(ctx, bounds.maxX, topY, 0, 6 / zoom)

  // Vertical dimension
  ctx.beginPath()
  ctx.moveTo(leftX, bounds.minY)
  ctx.lineTo(leftX, bounds.maxY)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(leftX - tick / 2, bounds.minY)
  ctx.lineTo(leftX + tick / 2, bounds.minY)
  ctx.moveTo(leftX - tick / 2, bounds.maxY)
  ctx.lineTo(leftX + tick / 2, bounds.maxY)
  ctx.stroke()
  drawArrow(ctx, leftX, bounds.minY, -Math.PI / 2, 6 / zoom)
  drawArrow(ctx, leftX, bounds.maxY, Math.PI / 2, 6 / zoom)

  const pixels = getLayoutPixelDimensions(layout)
  const widthLabel = showPixels && pixels.width_px
    ? `${bounds.width} mm / ${pixels.width_px} px`
    : `${bounds.width} mm`
  const heightLabel = showPixels && pixels.height_px
    ? `${bounds.height} mm / ${pixels.height_px} px`
    : `${bounds.height} mm`

  ctx.fillText(widthLabel, bounds.minX + bounds.width / 2, topY - 10 / zoom)

  ctx.save()
  ctx.translate(leftX - 10 / zoom, bounds.minY + bounds.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(heightLabel, 0, 0)
  ctx.restore()
}

export function drawOverview(ctx: CanvasRenderingContext2D, layout: LayoutData, options: OverviewRenderOptions) {
  const palette = { ...DEFAULT_PALETTE, ...options.palette }
  const { zoom, panX, panY, viewportWidth, viewportHeight } = options
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
    ctx.lineWidth = 1 / zoom

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
    ctx.lineWidth = 2 / zoom
    ctx.beginPath()
    ctx.moveTo(-20, 0)
    ctx.lineTo(60, 0)
    ctx.moveTo(0, -20)
    ctx.lineTo(0, 60)
    ctx.stroke()
  }

  const gridLabels = shouldShowGridLabels(options.labelsMode) ? getGridLabelMap(layout) : null

  layout.cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return

    const isSelected = cabinet.id === options.selectedCabinetId
    const hasError = errorCabinetIds.has(cabinet.id)

    ctx.fillStyle = hasError ? palette.cabinetErrorFill : palette.cabinetFill
    if (isSelected) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.3)"
    }
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)

    ctx.strokeStyle = hasError ? palette.cabinetErrorStroke : palette.cabinetStroke
    if (isSelected) {
      ctx.strokeStyle = palette.cabinetSelected
    }
    ctx.lineWidth = isSelected ? 3 / zoom : 2 / zoom
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

    const fontSize = Math.max(12, 14 / zoom)
    const smallFontSize = Math.max(9, 10 / zoom)

    if (options.labelsMode === "internal") {
      ctx.fillStyle = palette.labelPrimary
      ctx.font = `${fontSize}px Geist, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(cabinet.id, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - fontSize / 2)
    }

    ctx.fillStyle = palette.labelSecondary
    ctx.font = `${smallFontSize}px Geist Mono, monospace`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(
      cabinet.typeId.replace("STD_", ""),
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2 + fontSize / 2,
    )

    if (gridLabels) {
      const label = gridLabels.get(cabinet.id)
      if (label) {
        ctx.fillStyle = palette.labelPrimary
        ctx.font = `${smallFontSize}px Geist Mono, monospace`
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        const pad = 6 / zoom
        ctx.fillText(label, bounds.x + pad, bounds.y + pad)
      }
    }

    const receiverLabel = getReceiverCardLabel(layout, cabinet)
    if (receiverLabel && options.showReceiverCards) {
      ctx.font = `${smallFontSize}px Geist Mono, monospace`
      const textWidth = ctx.measureText(receiverLabel).width
      const cardPadding = 6 / zoom
      const maxCardWidth = bounds.width * 0.8
      const cardWidth = Math.min(maxCardWidth, textWidth + cardPadding * 2)
      const cardHeight = Math.min(bounds.height * 0.3, Math.max(14 / zoom, smallFontSize + cardPadding))
      const cardX = bounds.x + (bounds.width - cardWidth) / 2
      const cardY = bounds.y + (bounds.height - cardHeight) / 2

      ctx.fillStyle = palette.receiverCardFill
      ctx.strokeStyle = palette.receiverCardStroke
      ctx.lineWidth = 1 / zoom
      ctx.fillRect(cardX, cardY, cardWidth, cardHeight)
      ctx.strokeRect(cardX, cardY, cardWidth, cardHeight)

      ctx.fillStyle = palette.receiverCardText
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(receiverLabel, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    }

    if (cabinet.rot_deg !== 0) {
      ctx.fillStyle = palette.labelPrimary
      ctx.font = `${smallFontSize}px Geist Mono, monospace`
      ctx.textAlign = "right"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(`${cabinet.rot_deg} deg`, bounds.x + bounds.width - 4, bounds.y + smallFontSize + 4)
    }
  })

  if (options.showDimensions) {
    drawDimensionLines(ctx, layout, zoom, palette, options.showPixels)
  }

  ctx.restore()
}
