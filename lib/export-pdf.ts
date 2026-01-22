import { jsPDF } from "jspdf"
import type { LayoutData } from "./types"
import { getCabinetBounds, getLayoutBounds } from "./validation"
import { drawOverview } from "./overview-renderer"
import { getTitleParts } from "./overview-utils"
import { getCabinetReceiverCardCount, parseRouteCabinetId } from "./types"
import { getPowerFeedLoadW } from "./power-utils"

const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
}

const FONT_FAMILY = "Geist, sans-serif"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function scaledWorldSize(basePx: number, zoom: number, minPx: number, maxPx: number) {
  const sizePx = clamp(basePx * zoom, minPx, maxPx)
  return sizePx / zoom
}

function getLayoutBoundsFromCabinets(
  cabinets: LayoutData["cabinets"],
  cabinetTypes: LayoutData["cabinetTypes"],
) {
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
  return { minX, minY, maxX, maxY }
}

function computeLabelBounds(layout: LayoutData, ctx: CanvasRenderingContext2D, zoom: number, uiScale = 1) {
  const uiZoom = uiScale > 0 ? zoom / uiScale : zoom
  const layoutBounds = getLayoutBounds(layout)
  let minX = layoutBounds.minX
  let minY = layoutBounds.minY
  let maxX = layoutBounds.maxX
  let maxY = layoutBounds.maxY

  const dataRoutes = layout.project.dataRoutes ?? []
  const forcePortLabelsBottom = layout.project.overview.forcePortLabelsBottom ?? false
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

  const dataFontSize = scaledWorldSize(14, uiZoom, 12, 18)
  const dataFontPx = dataFontSize * zoom
  const dataLabelPadding = scaledWorldSize(8, uiZoom, 6, 12)
  const dataLabelOffset = 90
  const dataLabelSideGap = scaledWorldSize(60, uiZoom, 40, 90)
  const dataLabelHeight = dataFontSize + dataLabelPadding * 1.6
  let maxPortLabelWidthLeft = 0
  let maxPortLabelWidthRight = 0
  let hasBottomPortLabel = false

  if (dataRoutes.length > 0) {
    ctx.font = `bold ${dataFontPx}px ${FONT_FAMILY}`
    dataRoutes.forEach((route) => {
      if (route.cabinetIds.length === 0) return
      const firstEndpoint = route.cabinetIds.find((endpointId) => {
        const { cabinetId } = parseRouteCabinetId(endpointId)
        const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
        if (!cabinet) return false
        return getCabinetReceiverCardCount(cabinet) > 0
      })
      if (!firstEndpoint) return
      const { cabinetId } = parseRouteCabinetId(firstEndpoint)
      const cabinet = layout.cabinets.find((c) => c.id === cabinetId)
      if (!cabinet) return
      const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (!bounds) return
      const portLabel = `Port ${route.port}`
      const measuredWidth = ctx.measureText(portLabel).width / zoom
      const estimatedWidth = portLabel.length * dataFontSize * 0.62
      const labelWidth = Math.max(measuredWidth, estimatedWidth) + dataLabelPadding * 2

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

      const labelCenterX =
        resolvedPosition === "left"
          ? layoutBounds.minX - dataLabelSideGap - labelWidth / 2
          : resolvedPosition === "right"
            ? layoutBounds.maxX + dataLabelSideGap + labelWidth / 2
            : bounds.x + bounds.width / 2
      const labelCenterY =
        resolvedPosition === "top"
          ? layoutBounds.minY - dataLabelOffset
          : resolvedPosition === "bottom"
            ? layoutBounds.maxY + dataLabelOffset
            : bounds.y + bounds.height / 2

      minX = Math.min(minX, labelCenterX - labelWidth / 2)
      maxX = Math.max(maxX, labelCenterX + labelWidth / 2)
      minY = Math.min(minY, labelCenterY - dataLabelHeight / 2)
      maxY = Math.max(maxY, labelCenterY + dataLabelHeight / 2)

      if (resolvedPosition === "left") {
        maxPortLabelWidthLeft = Math.max(maxPortLabelWidthLeft, labelWidth)
      } else if (resolvedPosition === "right") {
        maxPortLabelWidthRight = Math.max(maxPortLabelWidthRight, labelWidth)
      } else if (resolvedPosition === "bottom") {
        hasBottomPortLabel = true
      }
    })
  }

  const maxPortLabelBottom = hasBottomPortLabel
    ? layoutBounds.maxY + dataLabelOffset + dataLabelHeight / 2
    : null

  const powerFeeds = layout.project.powerFeeds ?? []
  if (powerFeeds.length > 0) {
    const fontSize = scaledWorldSize(14, uiZoom, 12, 18)
    const fontPx = fontSize * zoom
    const labelPaddingX = scaledWorldSize(9, uiZoom, 6, 13)
    const labelPaddingY = scaledWorldSize(6, uiZoom, 4, 9)
    const labelOffset = 140
    const labelSideGap = scaledWorldSize(110, uiZoom, 70, 160)
    const sideLabelGap = scaledWorldSize(12, uiZoom, 8, 18)
    const powerLabelSideGap = scaledWorldSize(60, uiZoom, 40, 90)
    const bottomClearance = scaledWorldSize(16, uiZoom, 10, 22)

    const sideOffsetLeft =
      maxPortLabelWidthLeft > 0 ? powerLabelSideGap + maxPortLabelWidthLeft + sideLabelGap : labelSideGap
    const sideOffsetRight =
      maxPortLabelWidthRight > 0 ? powerLabelSideGap + maxPortLabelWidthRight + sideLabelGap : labelSideGap

    powerFeeds.forEach((feed) => {
      if (feed.assignedCabinetIds.length === 0) return
      const feedCabinets = layout.cabinets.filter((c) => feed.assignedCabinetIds.includes(c.id))
      const feedBounds = getLayoutBoundsFromCabinets(feedCabinets, layout.cabinetTypes)
      if (!feedBounds) return
      const firstCabinet = feedCabinets[0]
      const firstBounds = firstCabinet ? getCabinetBounds(firstCabinet, layout.cabinetTypes) : null
      const anchorX = firstBounds ? firstBounds.x + firstBounds.width / 2 : feedBounds.minX
      const anchorY = firstBounds ? firstBounds.y + firstBounds.height / 2 : feedBounds.minY

      const loadW = getPowerFeedLoadW(feed, layout.cabinets, layout.cabinetTypes)
      const breakerText = feed.breaker || feed.label
      const labelText = `${breakerText} | ${loadW}W`
      const connectorText = feed.connector

      ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`
      const labelMeasured = ctx.measureText(labelText).width / zoom
      const connectorMeasured = ctx.measureText(connectorText).width / zoom
      const labelEstimated = labelText.length * fontSize * 0.62
      const connectorEstimated = connectorText.length * fontSize * 0.62
      const maxTextWidth = Math.max(labelMeasured, connectorMeasured, labelEstimated, connectorEstimated)
      const boxWidth = maxTextWidth + labelPaddingX * 2
      const boxHeight = fontSize * 2.4 + labelPaddingY * 2

      const labelPosition = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : "bottom"
      const labelCenterX =
        labelPosition === "left"
          ? layoutBounds.minX - sideOffsetLeft - boxWidth / 2
          : labelPosition === "right"
            ? layoutBounds.maxX + sideOffsetRight + boxWidth / 2
            : anchorX
      let labelCenterY: number
      if (labelPosition === "bottom") {
        let labelTop = feedBounds.maxY + labelOffset
        if (maxPortLabelBottom !== null) {
          labelTop = Math.max(labelTop, maxPortLabelBottom + bottomClearance)
        }
        labelCenterY = labelTop + boxHeight / 2
      } else if (labelPosition === "top") {
        labelCenterY = feedBounds.minY - labelOffset
      } else {
        labelCenterY = anchorY
      }

      minX = Math.min(minX, labelCenterX - boxWidth / 2)
      maxX = Math.max(maxX, labelCenterX + boxWidth / 2)
      minY = Math.min(minY, labelCenterY - boxHeight / 2)
      maxY = Math.max(maxY, labelCenterY + boxHeight / 2)
    })
  }

  return { minX, minY, maxX, maxY }
}

export function exportOverviewPdf(layout: LayoutData) {
  const { pageSize, viewSide } = layout.project.exportSettings
  const orientation: "portrait" | "landscape" = "landscape"
  const baseSize = PAGE_SIZES_MM[pageSize]
  const pageWidthMm = orientation === "landscape" ? baseSize.height : baseSize.width
  const pageHeightMm = orientation === "landscape" ? baseSize.width : baseSize.height

  const dpi = 300
  const pxPerMm = dpi / 25.4
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(pageWidthMm * pxPerMm)
  canvas.height = Math.round(pageHeightMm * pxPerMm)

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const headerMm = 8
  const marginMm = 6
  const headerPx = Math.round(headerMm * pxPerMm)
  const marginPx = Math.round(marginMm * pxPerMm)

  const bounds = getLayoutBounds(layout)
  const dimensionOffsetMm = 260
  const extraLeftMm = 320
  const extraRightMm = 380
  const extraTopMm = dimensionOffsetMm + 120
  const extraBottomMm = 520

  const baseBounds = {
    minX: bounds.minX - extraLeftMm,
    maxX: bounds.maxX + extraRightMm,
    minY: bounds.minY - extraTopMm,
    maxY: bounds.maxY + extraBottomMm,
  }
  const availableWidth = canvas.width - marginPx * 2
  const availableHeight = canvas.height - headerPx - marginPx * 2
  const uiScale = 3.0

  let printBounds = { ...baseBounds }
  for (let i = 0; i < 4; i++) {
    const contentWidth = printBounds.maxX - printBounds.minX
    const contentHeight = printBounds.maxY - printBounds.minY
    const zoom =
      contentWidth && contentHeight
        ? Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
        : 1
    const labelBounds = computeLabelBounds(layout, ctx, zoom, uiScale)
    const minX = Math.min(baseBounds.minX, labelBounds.minX)
    const maxX = Math.max(baseBounds.maxX, labelBounds.maxX)
    const minY = Math.min(baseBounds.minY, labelBounds.minY)
    const maxY = Math.max(baseBounds.maxY, labelBounds.maxY)
    const safetyPad = scaledWorldSize(18, zoom, 12, 28)
    printBounds = {
      minX: minX - safetyPad,
      maxX: maxX + safetyPad,
      minY: minY - safetyPad,
      maxY: maxY + safetyPad,
    }
  }

  const contentWidth = printBounds.maxX - printBounds.minX
  const contentHeight = printBounds.maxY - printBounds.minY
  const zoom =
    contentWidth && contentHeight
      ? Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
      : 1

  const extraX = Math.max(0, (availableWidth - contentWidth * zoom) / 2)
  const extraY = Math.max(0, (availableHeight - contentHeight * zoom) / 2)
  const panX = marginPx + extraX - printBounds.minX * zoom
  const panY = headerPx + marginPx + extraY - printBounds.minY * zoom

  drawOverview(ctx, layout, {
    zoom,
    panX,
    panY,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    showGrid: true,
    showOrigin: false,
    labelsMode: layout.project.overview.labelsMode,
    showCabinetLabels: layout.project.overview.showCabinetLabels,
    showDimensions: true,
    showPixels: layout.project.overview.showPixels,
    showReceiverCards: layout.project.overview.showReceiverCards,
    showDataRoutes: layout.project.overview.showDataRoutes,
    showPowerRoutes: layout.project.overview.showPowerRoutes,
    showModuleGrid: layout.project.overview.showModuleGrid,
    forcePortLabelsBottom: layout.project.overview.forcePortLabelsBottom,
    uiScale,
    dimensionOffsetMm,
    dimensionSide: "right",
    palette: {
      background: "#ffffff",
      gridLine: "#e5e7eb",
      cabinetFill: "rgba(224, 242, 254, 0.9)",
      cabinetFillAlt: "rgba(191, 219, 254, 0.9)",
      cabinetStroke: "#1d4ed8",
      cabinetSelected: "#1d4ed8",
      cabinetErrorFill: "rgba(248, 113, 113, 0.25)",
      cabinetErrorStroke: "#b91c1c",
      labelPrimary: "#0f172a",
      labelSecondary: "#334155",
      receiverCardFill: "#0b1220",
      receiverCardStroke: "#1f2a44",
      receiverCardText: "#f8fafc",
      dimensionLine: "#1f2937",
      dimensionText: "#111827",
      moduleGridLine: "rgba(148, 163, 184, 0.35)",
    },
  })

  // Title
  ctx.fillStyle = "#0f172a"
  ctx.font = `700 ${Math.round(5 * pxPerMm)}px Geist, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const title = getTitleParts(layout).join(" - ")
  ctx.fillText(title, canvas.width / 2, headerPx / 2)

  const viewLabel = viewSide === "back" ? "Back View" : "Front View"
  ctx.font = `600 ${Math.round(3.2 * pxPerMm)}px Geist, sans-serif`
  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  ctx.fillText(viewLabel, canvas.width - marginPx, headerPx / 2)

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pageSize,
  })
  const imgData = canvas.toDataURL("image/png")
  pdf.addImage(imgData, "PNG", 0, 0, pageWidthMm, pageHeightMm)
  const projectName = layout.project.name?.trim() || "NC"
  const filename = `${projectName} - OVERVIEW.pdf`
  pdf.save(filename)
}
