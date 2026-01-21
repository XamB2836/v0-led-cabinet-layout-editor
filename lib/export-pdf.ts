import { jsPDF } from "jspdf"
import type { LayoutData } from "./types"
import { getLayoutBounds } from "./validation"
import { drawOverview } from "./overview-renderer"
import { getTitleParts } from "./overview-utils"

const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
}

export function exportOverviewPdf(layout: LayoutData) {
  const { pageSize } = layout.project.exportSettings
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

  const extraHorizontalMm = Math.max(extraLeftMm, extraRightMm)
  const extraVerticalMm = Math.max(extraTopMm, extraBottomMm)
  const printBounds = {
    minX: bounds.minX - extraHorizontalMm,
    maxX: bounds.maxX + extraHorizontalMm,
    minY: bounds.minY - extraVerticalMm,
    maxY: bounds.maxY + extraVerticalMm,
  }
  const contentWidth = printBounds.maxX - printBounds.minX
  const contentHeight = printBounds.maxY - printBounds.minY
  const availableWidth = canvas.width - marginPx * 2
  const availableHeight = canvas.height - headerPx - marginPx * 2
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
    showDimensions: true,
    showPixels: layout.project.overview.showPixels,
    showReceiverCards: layout.project.overview.showReceiverCards,
    showDataRoutes: layout.project.overview.showDataRoutes,
    showPowerRoutes: layout.project.overview.showPowerRoutes,
    showModuleGrid: layout.project.overview.showModuleGrid,
    forcePortLabelsBottom: layout.project.overview.forcePortLabelsBottom,
    uiScale: 3.0,
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

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pageSize,
  })
  const imgData = canvas.toDataURL("image/png")
  pdf.addImage(imgData, "PNG", 0, 0, pageWidthMm, pageHeightMm)
  const filename = `${layout.project.name || "overview"}.pdf`.replace(/\s+/g, "_")
  pdf.save(filename)
}
