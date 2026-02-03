import { jsPDF } from "jspdf"
import type { LayoutData } from "./types"
import { getCabinetBounds, getLayoutBounds } from "./validation"
import { drawOverview } from "./overview-renderer"
import { getTitleParts } from "./overview-utils"
import { getCabinetReceiverCardCount, parseRouteCabinetId } from "./types"
import { getPowerFeedLoadW } from "./power-utils"
import { DEFAULT_RECEIVER_CARD_MODEL } from "./receiver-cards"

const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
}

const FONT_FAMILY = "Geist, sans-serif"
const WEIGHT_REF_AREA_MM2 = 1120 * 640
const WEIGHT_REF_KG = 19
const LB_PER_KG = 2.20462

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function scaledWorldSize(basePx: number, zoom: number, minPx: number, maxPx: number) {
  const sizePx = clamp(basePx * zoom, minPx, maxPx)
  return sizePx / zoom
}

function getCabinetAreaMm2(cabinet: LayoutData["cabinets"][number], types: LayoutData["cabinetTypes"]) {
  const bounds = getCabinetBounds(cabinet, types)
  if (!bounds) return 0
  return bounds.width * bounds.height
}

function getTotalLayoutLoadW(layout: LayoutData) {
  if (layout.cabinets.length === 0) return 0
  return getPowerFeedLoadW(
    {
      id: "__layout__",
      label: "",
      connector: "",
      consumptionW: 0,
      assignedCabinetIds: layout.cabinets.map((cabinet) => cabinet.id),
    },
    layout.cabinets,
    layout.cabinetTypes,
  )
}

function getTotalLayoutWeight(layout: LayoutData) {
  const totalArea = layout.cabinets.reduce((sum, cabinet) => sum + getCabinetAreaMm2(cabinet, layout.cabinetTypes), 0)
  const totalKg = totalArea * (WEIGHT_REF_KG / WEIGHT_REF_AREA_MM2)
  const totalLb = totalKg * LB_PER_KG
  return { totalKg, totalLb }
}

function getModuleSpec(layout: LayoutData) {
  const moduleSize = layout.project.overview.moduleSize
  const moduleOrientation = layout.project.overview.moduleOrientation
  const baseModule = moduleSize === "160x160" ? { width: 160, height: 160 } : { width: 320, height: 160 }
  const moduleWidth = moduleOrientation === "portrait" ? baseModule.height : baseModule.width
  const moduleHeight = moduleOrientation === "portrait" ? baseModule.width : baseModule.height
  return { baseModule, moduleWidth, moduleHeight, moduleOrientation }
}

function getTotalModuleCount(layout: LayoutData) {
  const { moduleWidth, moduleHeight } = getModuleSpec(layout)
  if (!moduleWidth || !moduleHeight) return 0
  return layout.cabinets.reduce((sum, cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return sum
    const cols = Math.max(0, Math.round(bounds.width / moduleWidth))
    const rows = Math.max(0, Math.round(bounds.height / moduleHeight))
    return sum + cols * rows
  }, 0)
}

function getCabinetSizeCounts(layout: LayoutData) {
  const counts = new Map<string, { width: number; height: number; count: number }>()
  layout.cabinets.forEach((cabinet) => {
    const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
    if (!bounds) return
    const width = Math.round(bounds.width)
    const height = Math.round(bounds.height)
    const key = `${width}x${height}`
    const entry = counts.get(key)
    if (entry) {
      entry.count += 1
    } else {
      counts.set(key, { width, height, count: 1 })
    }
  })
  return Array.from(counts.values()).sort((a, b) => {
    const areaDiff = b.width * b.height - a.width * a.height
    if (areaDiff !== 0) return areaDiff
    if (b.width !== a.width) return b.width - a.width
    return b.height - a.height
  })
}

type LegendRow = { label: string; valueLines: string[] }
type LegendLayout = {
  rows: LegendRow[]
  boxWidth: number
  boxHeight: number
  paddingX: number
  paddingY: number
  columnGap: number
  lineHeight: number
  rowGap: number
  labelWidth: number
  labelFont: string
  valueFont: string
  pxPerMm: number
}

function buildPdfLegendLayout(ctx: CanvasRenderingContext2D, layout: LayoutData, pxPerMm: number): LegendLayout {
  const bodyFontPx = Math.round(3.0 * pxPerMm)
  const paddingX = Math.round(2.4 * pxPerMm)
  const paddingY = Math.round(2.2 * pxPerMm)
  const rowGap = Math.round(0.7 * pxPerMm)
  const lineHeight = Math.round(bodyFontPx * 1.32)
  const columnGap = Math.round(2.4 * pxPerMm)
  const maxBoxWidth = Math.round(95 * pxPerMm)

  const receiverType = layout.project.overview.receiverCardModel?.trim() || DEFAULT_RECEIVER_CARD_MODEL
  const controllerOverride = layout.project.controllerLabel?.trim()
  const controllerLabel = controllerOverride || layout.project.controller
  const totalLoadW = getTotalLayoutLoadW(layout)
  const { totalKg, totalLb } = getTotalLayoutWeight(layout)
  const weightLb = Math.ceil(totalLb)
  const weightKg = Math.ceil(totalKg * 10) / 10
  const { baseModule, moduleOrientation } = getModuleSpec(layout)
  const moduleCount = getTotalModuleCount(layout)
  const pitch = layout.project.pitch_mm
  const pitchLabel = layout.project.pitch_is_gob ? `${pitch} GOB` : `${pitch} mm`
  const moduleLabel = `${baseModule.width}x${baseModule.height} ${moduleOrientation}`
  const cabinetEntries = getCabinetSizeCounts(layout)
  const cabinetsValue =
    cabinetEntries.length === 0
      ? "none"
      : cabinetEntries.map((entry) => `${entry.width}x${entry.height} (${entry.count}x)`).join("\n")
  const breakerCounts = (layout.project.powerFeeds ?? []).reduce(
    (acc, feed) => {
      if (feed.assignedCabinetIds.length === 0) return acc
      const breakerLabel = feed.breaker ?? ""
      const voltage = breakerLabel.includes("220") ? "220V" : breakerLabel.includes("110") ? "110V" : "n/a"
      acc[voltage] = (acc[voltage] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const breakerCountParts = Object.entries(breakerCounts)
    .filter(([, count]) => count > 0)
    .map(([voltage, count]) => `${voltage} x${count}`)
  const breakerValue = breakerCountParts.length > 0 ? breakerCountParts.join(", ") : "0"

  const rows = [
    { label: "Max power", value: `${totalLoadW} W` },
    { label: "Breaker", value: breakerValue },
    { label: "Receiver", value: receiverType },
    { label: "Card type", value: controllerLabel },
    { label: "Weight", value: `${weightLb} lb / ${weightKg.toFixed(1)} kg` },
    { label: "Modules", value: `${moduleLabel} / ${moduleCount} pcs / ${pitchLabel}` },
    { label: "Cabinets", value: cabinetsValue },
  ]

  const labelFont = `600 ${bodyFontPx}px ${FONT_FAMILY}`
  const valueFont = `400 ${bodyFontPx}px ${FONT_FAMILY}`

  ctx.font = labelFont
  const labelWidth = rows.reduce((max, row) => Math.max(max, ctx.measureText(row.label).width), 0)
  const valueMaxWidth = Math.max(20, maxBoxWidth - paddingX * 2 - labelWidth - columnGap)

  const wrapText = (text: string) => {
    ctx.font = valueFont
    const lines: string[] = []
    const paragraphs = text.split("\n")
    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(" ").filter(Boolean)
      if (words.length === 0) {
        lines.push("")
        return
      }
      let line = ""
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word
        if (ctx.measureText(next).width <= valueMaxWidth || line.length === 0) {
          line = next
        } else {
          lines.push(line)
          line = word
        }
      })
      if (line) lines.push(line)
    })
    return lines
  }

  const wrappedRows = rows.map((row) => ({ label: row.label, valueLines: wrapText(row.value) }))
  const maxValueWidth = wrappedRows.reduce((max, row) => {
    ctx.font = valueFont
    const rowMax = row.valueLines.reduce((rowMaxValue, line) => Math.max(rowMaxValue, ctx.measureText(line).width), 0)
    return Math.max(max, rowMax)
  }, 0)

  const contentWidth = labelWidth + columnGap + maxValueWidth
  const boxWidth = Math.ceil(contentWidth + paddingX * 2)
  const boxHeight =
    paddingY * 2 +
    wrappedRows.reduce((sum, row) => sum + row.valueLines.length * lineHeight, 0) +
    rowGap * (wrappedRows.length - 1)

  return {
    rows: wrappedRows,
    boxWidth,
    boxHeight,
    paddingX,
    paddingY,
    columnGap,
    lineHeight,
    rowGap,
    labelWidth,
    labelFont,
    valueFont,
    pxPerMm,
  }
}

function drawPdfLegend(
  ctx: CanvasRenderingContext2D,
  legend: LegendLayout,
  options: { rightX: number; topY: number },
) {
  const { rightX, topY } = options
  const {
    rows,
    boxWidth,
    boxHeight,
    paddingX,
    paddingY,
    columnGap,
    lineHeight,
    rowGap,
    labelWidth,
    labelFont,
    valueFont,
    pxPerMm,
  } = legend
  const boxX = rightX - boxWidth
  const boxY = topY

  ctx.save()
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = Math.max(1, Math.round(0.12 * pxPerMm))
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  let cursorY = boxY + paddingY
  rows.forEach((row) => {
    ctx.font = labelFont
    ctx.fillStyle = "#0f172a"
    ctx.fillText(row.label, boxX + paddingX, cursorY)

    ctx.font = valueFont
    ctx.fillStyle = "#1f2937"
    row.valueLines.forEach((line, index) => {
      ctx.fillText(line, boxX + paddingX + labelWidth + columnGap, cursorY + index * lineHeight)
    })

    cursorY += row.valueLines.length * lineHeight + rowGap
  })
  ctx.restore()
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
    const getReceiverCardRects = (bounds: { x: number; y: number; width: number; height: number }, count: 0 | 1 | 2) => {
      if (count <= 0) return []
      const maxWidth = Math.min(80 / uiZoom, bounds.width * 0.6)
      const minWidth = Math.min(28 / uiZoom, maxWidth)
      const heightFraction = count === 2 ? 0.18 : 0.22
      const maxHeight = Math.min(14 / uiZoom, bounds.height * heightFraction)
      const minHeight = Math.min(8 / uiZoom, maxHeight)
      const cardWidth = Math.min(maxWidth, Math.max(minWidth, bounds.width * 0.7))
      const cardHeight = Math.min(maxHeight, Math.max(minHeight, bounds.height * 0.2))
      const cardX = bounds.x + bounds.width / 2 - cardWidth / 2
      const cardY = bounds.y + bounds.height / 2 - cardHeight / 2

      if (count === 1) {
        return [{ x: cardX, y: cardY, width: cardWidth, height: cardHeight }]
      }

      const gap = Math.min(10 / uiZoom, cardHeight)
      const totalHeight = cardHeight * 2 + gap
      const startY = bounds.y + bounds.height / 2 - totalHeight / 2
      return [
        { x: cardX, y: startY, width: cardWidth, height: cardHeight },
        { x: cardX, y: startY + cardHeight + gap, width: cardWidth, height: cardHeight },
      ]
    }

    const getPowerAnchorPoint = (
      cardRect: { x: number; y: number; width: number; height: number },
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      const margin = Math.min(8 / uiZoom, bounds.width * 0.04)
      const offset = Math.min(6 / uiZoom, cardRect.width * 0.25)
      const anchorX = Math.max(bounds.x + margin, cardRect.x - offset)
      return { x: anchorX, y: cardRect.y + cardRect.height / 2 }
    }

    const getPowerSteps = (feed: LayoutData["project"]["powerFeeds"][number]) => {
      if (feed.manualMode && feed.steps && feed.steps.length > 0) return feed.steps
      return feed.assignedCabinetIds.map((cabinetId) => ({ type: "cabinet", endpointId: cabinetId }))
    }

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

    const fontSize = scaledWorldSize(14, uiZoom, 12, 18)
    const fontPx = fontSize * zoom
    const labelPaddingX = scaledWorldSize(9, uiZoom, 6, 13)
    const labelPaddingY = scaledWorldSize(6, uiZoom, 4, 9)
    const labelOffset = 140
    const labelSideGap = scaledWorldSize(110, uiZoom, 70, 160)
    const sideLabelGap = scaledWorldSize(12, uiZoom, 8, 18)
    const powerLabelSideGap = scaledWorldSize(60, uiZoom, 40, 90)
    const bottomClearance = scaledWorldSize(16, uiZoom, 10, 22)
    const labelGap = scaledWorldSize(14, uiZoom, 10, 22)

    const sideOffsetLeft =
      maxPortLabelWidthLeft > 0 ? powerLabelSideGap + maxPortLabelWidthLeft + sideLabelGap : labelSideGap
    const sideOffsetRight =
      maxPortLabelWidthRight > 0 ? powerLabelSideGap + maxPortLabelWidthRight + sideLabelGap : labelSideGap

    const bottomPlans: { id: string; desiredX: number; width: number }[] = []
    const topPlans: { id: string; desiredX: number; width: number }[] = []

    powerFeeds.forEach((feed) => {
      if (feed.assignedCabinetIds.length === 0) return
      const steps = getPowerSteps(feed)
      let anchorX: number | null = null
      let anchorY: number | null = null

      for (const step of steps) {
        if (step.type === "point") {
          anchorX = step.x_mm
          anchorY = step.y_mm
          break
        }
        const cabinet = layout.cabinets.find((c) => c.id === step.endpointId)
        if (!cabinet) continue
        const bounds = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (!bounds) continue
        const cardCount = getCabinetReceiverCardCount(cabinet)
        const rects = getReceiverCardRects(bounds, cardCount)
        if (rects.length > 0) {
          const layoutMidY = (layoutBounds.minY + layoutBounds.maxY) / 2
          const anchorRect =
            rects.length === 1 ? rects[0] : bounds.y + bounds.height / 2 > layoutMidY ? rects[1] : rects[0]
          const anchor = getPowerAnchorPoint(anchorRect, bounds)
          anchorX = anchor.x
          anchorY = anchor.y
        } else {
          anchorX = bounds.x + bounds.width / 2
          anchorY = bounds.y + bounds.height / 2
        }
        break
      }

      if (anchorX === null || anchorY === null) return

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

      const labelPosition = feed.labelPosition && feed.labelPosition !== "auto" ? feed.labelPosition : "bottom"
      if (labelPosition === "bottom") {
        bottomPlans.push({ id: feed.id, desiredX: anchorX, width: boxWidth })
      } else if (labelPosition === "top") {
        topPlans.push({ id: feed.id, desiredX: anchorX, width: boxWidth })
      }
    })

    const bottomCenters = distributeLabelCenters(bottomPlans, labelGap)
    const topCenters = distributeLabelCenters(topPlans, labelGap)

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
      let labelCenterX =
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
      if (labelPosition === "bottom") {
        labelCenterX = bottomCenters.get(feed.id) ?? labelCenterX
      } else if (labelPosition === "top") {
        labelCenterX = topCenters.get(feed.id) ?? labelCenterX
      }

      minX = Math.min(minX, labelCenterX - boxWidth / 2)
      maxX = Math.max(maxX, labelCenterX + boxWidth / 2)
      minY = Math.min(minY, labelCenterY - boxHeight / 2)
      maxY = Math.max(maxY, labelCenterY + boxHeight / 2)
    })
  }

  return { minX, minY, maxX, maxY }
}

function rectIntersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

function pickLegendPosition(options: {
  pageWidth: number
  pageHeight: number
  headerPx: number
  marginPx: number
  legendWidth: number
  legendHeight: number
  contentRect: { x: number; y: number; width: number; height: number }
}) {
  const { pageWidth, pageHeight, headerPx, marginPx, legendWidth, legendHeight, contentRect } = options
  const minY = headerPx + marginPx
  const maxY = pageHeight - marginPx - legendHeight
  const maxX = pageWidth - marginPx - legendWidth
  const clampX = (x: number) => clamp(x, marginPx, maxX)
  const clampY = (y: number) => clamp(y, minY, maxY)

  const candidates = [
    { x: maxX, y: minY, weight: 0 },
    { x: marginPx, y: minY, weight: 1 },
    { x: maxX, y: maxY, weight: 2 },
    { x: marginPx, y: maxY, weight: 3 },
  ].map((candidate) => ({
    ...candidate,
    x: clampX(candidate.x),
    y: clampY(candidate.y),
  }))

  let best = candidates[0]
  let bestArea = Number.POSITIVE_INFINITY
  candidates.forEach((candidate) => {
    const area = rectIntersectionArea(
      { x: candidate.x, y: candidate.y, width: legendWidth, height: legendHeight },
      contentRect,
    )
    if (area < bestArea || (area === bestArea && candidate.weight < best.weight)) {
      bestArea = area
      best = candidate
    }
  })

  return { x: best.x, y: best.y }
}

export async function exportOverviewPdf(layout: LayoutData) {
  const { pageSize, viewSide } = layout.project.exportSettings
  const orientation: "portrait" | "landscape" = "landscape"
  const baseSize = PAGE_SIZES_MM[pageSize]
  const pageWidthMm = orientation === "landscape" ? baseSize.height : baseSize.width
  const pageHeightMm = orientation === "landscape" ? baseSize.width : baseSize.height

  const renderDpi = 300
  const outputDpi = 200
  const pxPerMm = renderDpi / 25.4
  const outputPxPerMm = outputDpi / 25.4
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(pageWidthMm * pxPerMm)
  canvas.height = Math.round(pageHeightMm * pxPerMm)

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const headerMm = 8
  const marginMm = 6
  const headerPx = Math.round(headerMm * pxPerMm)
  const marginPx = Math.round(marginMm * pxPerMm)
  const showLegend = layout.project.exportSettings.showLegend ?? true
  const legendLayout = showLegend ? buildPdfLegendLayout(ctx, layout, pxPerMm) : null
  const legendGapPx = Math.round(3 * pxPerMm)

  const bounds = getLayoutBounds(layout)
  let dimensionOffsetMm = 260
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
  let contentAvailableWidth = availableWidth
  let contentAvailableHeight = availableHeight
  let legendPosition: { rightX: number; topY: number } | null = null

  if (legendLayout) {
    const reserveBottom = availableHeight - legendLayout.boxHeight - legendGapPx
    contentAvailableHeight = reserveBottom > 0 ? reserveBottom : availableHeight
    legendPosition = {
      rightX: marginPx + legendLayout.boxWidth,
      topY: headerPx + marginPx + contentAvailableHeight + legendGapPx,
    }
  }
  const uiScale = 3.0

  let printBounds = { ...baseBounds }
  for (let i = 0; i < 4; i++) {
    const contentWidth = printBounds.maxX - printBounds.minX
    const contentHeight = printBounds.maxY - printBounds.minY
    const zoom =
      contentWidth && contentHeight
        ? Math.min(contentAvailableWidth / contentWidth, contentAvailableHeight / contentHeight)
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
      ? Math.min(contentAvailableWidth / contentWidth, contentAvailableHeight / contentHeight)
      : 1

  const extraX = Math.max(0, (contentAvailableWidth - contentWidth * zoom) / 2)
  const extraY = Math.max(0, (contentAvailableHeight - contentHeight * zoom) / 2)
  const panX = marginPx + extraX - printBounds.minX * zoom
  const panY = headerPx + marginPx + extraY - printBounds.minY * zoom
  const minTopGapPx = Math.round(6 * pxPerMm)
  const minTopY = headerPx + minTopGapPx
  const topDimensionY = panY + (bounds.minY - dimensionOffsetMm) * zoom
  if (topDimensionY < minTopY) {
    const adjustedOffset = bounds.minY - (minTopY - panY) / zoom
    dimensionOffsetMm = Math.max(140, Math.min(dimensionOffsetMm, adjustedOffset))
  }

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

  const viewLabel = viewSide === "back" ? "BACK VIEW" : "FRONT VIEW"
  const viewFontPx = Math.round(3.4 * pxPerMm)
  ctx.font = `700 ${viewFontPx}px Geist, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const viewLabelY = canvas.height - Math.round(4.5 * pxPerMm)
  ctx.fillText(viewLabel, canvas.width / 2, viewLabelY)

  if (legendLayout && legendPosition) {
    drawPdfLegend(ctx, legendLayout, {
      rightX: legendPosition.rightX,
      topY: legendPosition.topY,
    })
  }

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pageSize,
  })
  const outputCanvas =
    outputDpi === renderDpi
      ? canvas
      : (() => {
          const downscaled = document.createElement("canvas")
          downscaled.width = Math.round(pageWidthMm * outputPxPerMm)
          downscaled.height = Math.round(pageHeightMm * outputPxPerMm)
          const downscaledCtx = downscaled.getContext("2d")
          if (!downscaledCtx) return canvas
          downscaledCtx.imageSmoothingEnabled = true
          downscaledCtx.imageSmoothingQuality = "high"
          downscaledCtx.drawImage(canvas, 0, 0, downscaled.width, downscaled.height)
          return downscaled
        })()
  const imgData = outputCanvas.toDataURL("image/jpeg", 0.82)
  pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, pageHeightMm, undefined, "MEDIUM")
  const projectName = layout.project.name?.trim() || "NC"
  const filename = `${projectName} - OVERVIEW.pdf`
  pdf.save(filename)
}
