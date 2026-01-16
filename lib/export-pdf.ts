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
  const { pageSize, orientation } = layout.project.exportSettings
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

  const headerMm = 18
  const marginMm = 12
  const headerPx = Math.round(headerMm * pxPerMm)
  const marginPx = Math.round(marginMm * pxPerMm)

  const bounds = getLayoutBounds(layout)
  const availableWidth = canvas.width - marginPx * 2
  const availableHeight = canvas.height - headerPx - marginPx * 2
  const zoom =
    bounds.width && bounds.height
      ? Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
      : 1

  const panX = marginPx + (availableWidth - bounds.width * zoom) / 2 - bounds.minX * zoom
  const panY = headerPx + marginPx + (availableHeight - bounds.height * zoom) / 2 - bounds.minY * zoom

  drawOverview(ctx, layout, {
    zoom,
    panX,
    panY,
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    showGrid: false,
    showOrigin: false,
    labelsMode: layout.project.overview.labelsMode,
    showDimensions: true,
    showPixels: layout.project.overview.showPixels,
    showReceiverCards: layout.project.overview.showReceiverCards,
    palette: {
      background: "#ffffff",
      gridLine: "#dddddd",
      cabinetFill: "rgba(59, 130, 246, 0.08)",
      cabinetStroke: "#1d4ed8",
      cabinetSelected: "#1d4ed8",
      cabinetErrorFill: "rgba(220, 38, 38, 0.2)",
      cabinetErrorStroke: "#b91c1c",
      labelPrimary: "#111827",
      labelSecondary: "#4b5563",
      receiverCardFill: "#ffffff",
      receiverCardStroke: "#111111",
      receiverCardText: "#111111",
      dimensionLine: "#374151",
      dimensionText: "#111827",
    },
  })

  // Title
  ctx.fillStyle = "#0f172a"
  ctx.font = `${Math.round(12 * pxPerMm)}px Geist, sans-serif`
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
