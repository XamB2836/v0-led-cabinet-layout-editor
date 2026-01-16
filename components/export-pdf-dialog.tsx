"use client"

import { useState, useCallback } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds, getLayoutBounds } from "@/lib/validation"
import { computeGridLabel } from "@/lib/types"
import { getBreakerSafeMaxW, getPowerFeedLoadW } from "@/lib/power-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FileDown, Loader2 } from "lucide-react"

export function ExportPdfDialog() {
  const { state, dispatch } = useEditor()
  const { layout } = state
  const { exportSettings } = layout.project
  const [isExporting, setIsExporting] = useState(false)
  const [open, setOpen] = useState(false)

  const bounds = getLayoutBounds(layout)
  const pitch = layout.project.pitch_mm
  const widthPx = Math.round(bounds.width / pitch)
  const heightPx = Math.round(bounds.height / pitch)

  // Generate SVG content for export
  const generateSVG = useCallback(() => {
    const { overview, dataRoutes, powerFeeds } = layout.project
    const labelsMode = overview?.labelsMode || "grid"
    const showReceiverCards = overview?.showReceiverCards ?? true
    const receiverCardModel = overview?.receiverCardModel || "5A75-E"
    const showPixels = overview?.showPixels ?? true
    const showDataRoutes = overview?.showDataRoutes ?? true
    const showPowerRoutes = overview?.showPowerRoutes ?? true

    // Page dimensions in mm (A4: 210x297, A3: 297x420)
    const pageWidths = { A4: 210, A3: 297 }
    const pageHeights = { A4: 297, A3: 420 }
    const pageW =
      exportSettings.orientation === "landscape"
        ? pageHeights[exportSettings.pageSize]
        : pageWidths[exportSettings.pageSize]
    const pageH =
      exportSettings.orientation === "landscape"
        ? pageWidths[exportSettings.pageSize]
        : pageHeights[exportSettings.pageSize]

    // Convert to pixels (96 DPI)
    const dpi = 96
    const mmToPx = dpi / 25.4
    const svgWidth = pageW * mmToPx
    const svgHeight = pageH * mmToPx

    // Calculate layout bounds
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY

    layout.cabinets.forEach((cabinet) => {
      const b = getCabinetBounds(cabinet, layout.cabinetTypes)
      if (b) {
        minX = Math.min(minX, b.x)
        minY = Math.min(minY, b.y)
        maxX = Math.max(maxX, b.x2)
        maxY = Math.max(maxY, b.y2)
      }
    })

    const layoutWidth = maxX - minX
    const layoutHeight = maxY - minY

    // Scale to fit on page with margins
    const margin = 25 * mmToPx
    const titleHeight = 50 * mmToPx
    const availableWidth = svgWidth - margin * 2
    const availableHeight = svgHeight - margin * 2 - titleHeight - 60 * mmToPx

    const scale = Math.min(availableWidth / layoutWidth, availableHeight / layoutHeight) * 0.8

    // Center offset
    const offsetX = margin + (availableWidth - layoutWidth * scale) / 2 - minX * scale
    const offsetY = margin + titleHeight + 40 * mmToPx + (availableHeight - layoutHeight * scale) / 2 - minY * scale

    // Build title
    const title = exportSettings.title || layout.project.name
    const subtitle = `${bounds.width} × ${bounds.height} mm${showPixels ? ` (${widthPx} × ${heightPx} px)` : ""} – Pitch ${pitch}mm – ${layout.project.controller}`

    let powerFeedElements = ""
    if (showPowerRoutes && powerFeeds && powerFeeds.length > 0) {
      powerFeeds.forEach((feed) => {
        if (feed.assignedCabinetIds.length === 0) return

        let feedMinX = Number.POSITIVE_INFINITY,
          feedMinY = Number.POSITIVE_INFINITY,
          feedMaxX = Number.NEGATIVE_INFINITY,
          feedMaxY = Number.NEGATIVE_INFINITY

        const points: { x: number; y: number }[] = []

        feed.assignedCabinetIds.forEach((id) => {
          const cabinet = layout.cabinets.find((c) => c.id === id)
          if (!cabinet) return
          const b = getCabinetBounds(cabinet, layout.cabinetTypes)
          if (!b) return
          feedMinX = Math.min(feedMinX, b.x)
          feedMinY = Math.min(feedMinY, b.y)
          feedMaxX = Math.max(feedMaxX, b.x2)
          feedMaxY = Math.max(feedMaxY, b.y2)
          const anchorX = b.x + b.width * 0.65
          points.push({
            x: offsetX + anchorX * scale,
            y: offsetY + (b.y + b.height / 2) * scale,
          })
        })

        if (feedMinX === Number.POSITIVE_INFINITY || points.length === 0) return

        let pathD = `M ${points[0].x} ${points[0].y}`
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          const dx = Math.abs(curr.x - prev.x)
          const dy = Math.abs(curr.y - prev.y)

          if (dx < 4 || dy < 4) {
            pathD += ` L ${curr.x} ${curr.y}`
          } else {
            pathD += ` L ${curr.x} ${prev.y} L ${curr.x} ${curr.y}`
          }
        }

        const breakerText = feed.breaker || ""
        const detailText = breakerText ? `${breakerText} • ${feed.connector}` : feed.connector
        const loadW = getPowerFeedLoadW(feed, layout.cabinets, layout.cabinetTypes)
        const safeMaxW = getBreakerSafeMaxW(feed.breaker)
        const consumptionText = safeMaxW ? `Load: ${loadW}W / ${safeMaxW}W` : `Load: ${loadW}W`
        const lineCount = 3
        const boxHeight = lineCount === 3 ? 36 : 28

        const labelX = points[0].x
        const labelY = offsetY + feedMaxY * scale + 110

        powerFeedElements += `
          <path d="${pathD}" fill="none" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="${labelX}" y1="${labelY}" x2="${points[0].x}" y2="${points[0].y}" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round"/>
          <rect x="${labelX - 40}" y="${labelY}" width="80" height="${boxHeight}" fill="#f97316" rx="2"/>
          <text x="${labelX}" y="${labelY + 10}" textAnchor="middle" fontFamily="monospace" fontSize="8" fontWeight="bold" fill="white">${feed.label}</text>
          <text x="${labelX}" y="${labelY + 20}" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="white">${detailText}</text>
          <text x="${labelX}" y="${labelY + 30}" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="white">${consumptionText}</text>
        `
      })
    }

    // Generate cabinet SVG elements
    const cabinetElements = layout.cabinets
      .map((cabinet) => {
        const b = getCabinetBounds(cabinet, layout.cabinetTypes)
        if (!b) return ""

        const x = offsetX + b.x * scale
        const y = offsetY + b.y * scale
        const w = b.width * scale
        const h = b.height * scale

        const label =
          labelsMode === "grid" ? computeGridLabel(cabinet, layout.cabinets, layout.cabinetTypes) : cabinet.id

        let receiverCard = ""
        if (showReceiverCards) {
          const cardModel =
            cabinet.receiverCardOverride === null ? null : cabinet.receiverCardOverride || receiverCardModel

          if (cardModel) {
            const cardW = Math.min(80, w * 0.7)
            const cardH = 22
            const cardX = x + w / 2 - cardW / 2
            const cardY = y + h / 2 - cardH / 2
            const connectorX = cardX + cardW / 2
            const connectorY = cardY + cardH + 6

            receiverCard = `
            <rect x="${cardX + 1}" y="${cardY + 1}" width="${cardW}" height="${cardH}" fill="rgba(15, 23, 42, 0.08)" rx="3"/>
            <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#f8fafc" stroke="#0f172a" strokeWidth="0.9" rx="3"/>
            <rect x="${cardX}" y="${cardY}" width="${cardW}" height="6" fill="#0f172a" rx="3"/>
            <text x="${cardX + cardW / 2}" y="${cardY + cardH / 2 + 2}" textAnchor="middle" dominantBaseline="middle" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="#0f172a">${cardModel}</text>
            <circle cx="${connectorX}" cy="${connectorY}" r="2.6" fill="#3b82f6"/>
          `
          }
        }

        const gridLabelBox =
          labelsMode === "grid"
            ? `
        <rect x="${x + 3}" y="${y + 3}" width="${label.length * 8 + 6}" height="14" fill="#f59e0b" rx="1"/>
        <text x="${x + 6}" y="${y + 13}" fontFamily="sans-serif" fontSize="10" fontWeight="bold" fill="black">${label}</text>
      `
            : ""

        return `
        <g>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56, 189, 248, 0.15)" stroke="#3b82f6" strokeWidth="1.5"/>
          ${gridLabelBox}
          ${labelsMode === "internal" ? `<text x="${x + w / 2}" y="${y + h / 2 - 5}" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#64748b">${label}</text>` : ""}
          <text x="${x + w / 2}" y="${y + h - 10}" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="#64748b">${cabinet.typeId.replace("STD_", "")}</text>
          ${receiverCard}
        </g>
      `
      })
      .join("\n")

    let dataRouteElements = ""
    if (showDataRoutes && dataRoutes && dataRoutes.length > 0) {
      dataRoutes.forEach((route) => {
        if (route.cabinetIds.length < 2) return

        const points: { x: number; y: number }[] = []
        route.cabinetIds.forEach((id) => {
          const cabinet = layout.cabinets.find((c) => c.id === id)
          if (!cabinet) return
          const b = getCabinetBounds(cabinet, layout.cabinetTypes)
          if (!b) return
          const centerX = offsetX + (b.x + b.width / 2) * scale
          const centerY = offsetY + (b.y + b.height / 2) * scale
          let pointX = centerX
          let pointY = centerY

          if (showReceiverCards) {
            const cardModel =
              cabinet.receiverCardOverride === null ? null : cabinet.receiverCardOverride || receiverCardModel
            if (cardModel) {
              const cardW = Math.min(80, b.width * scale * 0.7)
              const cardH = 22
              const cardX = centerX - cardW / 2
              const cardY = centerY - cardH / 2
              pointX = cardX + cardW / 2
              pointY = cardY + cardH + 6
            }
          }

          points.push({ x: pointX, y: pointY })
        })

        if (points.length < 2) return

        // Build path
        let pathD = `M ${points[0].x} ${points[0].y}`
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1]
          const curr = points[i]
          const dx = Math.abs(curr.x - prev.x)
          const dy = Math.abs(curr.y - prev.y)

          if (dx > dy) {
            const midX = (prev.x + curr.x) / 2
            pathD += ` L ${midX} ${prev.y} L ${midX} ${curr.y} L ${curr.x} ${curr.y}`
          } else {
            const midY = (prev.y + curr.y) / 2
            pathD += ` L ${prev.x} ${midY} L ${curr.x} ${midY} L ${curr.x} ${curr.y}`
          }
        }

        // Port label
        const portLabel = `
          <circle cx="${points[0].x - 12}" cy="${points[0].y}" r="8" fill="#3b82f6"/>
          <text x="${points[0].x - 12}" y="${points[0].y + 1}" textAnchor="middle" dominantBaseline="middle" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="white">P${route.port}</text>
        `

        dataRouteElements += `
          <line x1="${points[0].x - 4}" y1="${points[0].y}" x2="${points[0].x}" y2="${points[0].y}" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round"/>
          <path d="${pathD}" fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
          ${portLabel}
        `
      })
    }

    // Dimension lines
    const dimLineY = offsetY + layoutHeight * scale + 30 * mmToPx
    const dimLineX = offsetX + layoutWidth * scale + 25 * mmToPx
    const dimStartX = offsetX + minX * scale
    const dimEndX = offsetX + maxX * scale
    const dimStartY = offsetY + minY * scale
    const dimEndY = offsetY + maxY * scale

    const widthText = `${bounds.width} mm${showPixels ? ` (${widthPx} px)` : ""}`
    const heightText = `${bounds.height} mm${showPixels ? ` (${heightPx} px)` : ""}`

    const dimensionLines = `
      <!-- Width dimension -->
      <line x1="${dimStartX}" y1="${dimLineY - 15}" x2="${dimStartX}" y2="${dimLineY + 5}" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="${dimEndX}" y1="${dimLineY - 15}" x2="${dimEndX}" y2="${dimLineY + 5}" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="${dimStartX}" y1="${dimLineY}" x2="${dimEndX}" y2="${dimLineY}" stroke="#f59e0b" strokeWidth="1"/>
      <polygon points="${dimStartX},${dimLineY} ${dimStartX + 6},${dimLineY - 3} ${dimStartX + 6},${dimLineY + 3}" fill="#f59e0b"/>
      <polygon points="${dimEndX},${dimLineY} ${dimEndX - 6},${dimLineY - 3} ${dimEndX - 6},${dimLineY + 3}" fill="#f59e0b"/>
      <rect x="${(dimStartX + dimEndX) / 2 - 50}" y="${dimLineY - 8}" width="100" height="16" fill="white"/>
      <text x="${(dimStartX + dimEndX) / 2}" y="${dimLineY + 4}" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="bold" fill="#f59e0b">${widthText}</text>

      <!-- Height dimension -->
      <line x1="${dimLineX - 15}" y1="${dimStartY}" x2="${dimLineX + 5}" y2="${dimStartY}" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="${dimLineX - 15}" y1="${dimEndY}" x2="${dimLineX + 5}" y2="${dimEndY}" stroke="#f59e0b" strokeWidth="1"/>
      <line x1="${dimLineX}" y1="${dimStartY}" x2="${dimLineX}" y2="${dimEndY}" stroke="#f59e0b" strokeWidth="1"/>
      <polygon points="${dimLineX},${dimStartY} ${dimLineX - 3},${dimStartY + 6} ${dimLineX + 3},${dimStartY + 6}" fill="#f59e0b"/>
      <polygon points="${dimLineX},${dimEndY} ${dimLineX - 3},${dimEndY - 6} ${dimLineX + 3},${dimEndY - 6}" fill="#f59e0b"/>
      <g transform="translate(${dimLineX}, ${(dimStartY + dimEndY) / 2}) rotate(-90)">
        <rect x="-50" y="-8" width="100" height="16" fill="white"/>
        <text x="0" y="4" textAnchor="middle" fontFamily="monospace" fontSize="10" fontWeight="bold" fill="#f59e0b">${heightText}</text>
      </g>
    `

    const totalConsumption =
      powerFeeds?.reduce((sum, f) => sum + getPowerFeedLoadW(f, layout.cabinets, layout.cabinetTypes), 0) || 0
    const powerInfo = totalConsumption > 0 ? ` | Total Power: ${totalConsumption}W` : ""

    // Controller info
    const controllerPorts = layout.project.controller === "A100" ? 2 : 4
    const controllerInfo = `
      <text x="${margin}" y="${svgHeight - margin - 10}" fontFamily="sans-serif" fontSize="10" fill="#64748b">
        Controller: ${layout.project.controller} (${controllerPorts} ports) | Cabinets: ${layout.cabinets.length}${powerInfo} | Generated: ${new Date().toLocaleDateString()}
      </text>
    `

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="white"/>
  
  <!-- Title -->
  <text x="${svgWidth / 2}" y="${margin + 20}" textAnchor="middle" fontFamily="sans-serif" fontSize="18" fontWeight="bold" fill="#0a0a0a">${title}</text>
  <text x="${svgWidth / 2}" y="${margin + 42}" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#64748b">${subtitle}</text>
  ${exportSettings.clientName ? `<text x="${svgWidth / 2}" y="${margin + 58}" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#94a3b8">Client: ${exportSettings.clientName}</text>` : ""}
  
  <!-- Cabinets -->
  ${cabinetElements}
  
  <!-- Data Routes (on top) -->
  ${dataRouteElements}

  <!-- Power Feeds (above data) -->
  ${powerFeedElements}
  
  <!-- Dimensions -->
  ${dimensionLines}
  
  <!-- Footer -->
  ${controllerInfo}
</svg>`
  }, [layout, exportSettings, bounds, widthPx, heightPx, pitch])

  const handleExport = async () => {
    setIsExporting(true)

    try {
      const svgContent = generateSVG()

      // Create blob and download
      const blob = new Blob([svgContent], { type: "image/svg+xml" })
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `${(exportSettings.title || layout.project.name).replace(/\s+/g, "_")}_overview.svg`
      a.click()
      URL.revokeObjectURL(url)

      setOpen(false)
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <FileDown className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Overview</DialogTitle>
          <DialogDescription>
            Export your layout as an SVG overview document. Open in browser and print to PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="export-title">Title</Label>
            <Input
              id="export-title"
              value={exportSettings.title}
              onChange={(e) => dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { title: e.target.value } })}
              placeholder={layout.project.name}
              className="bg-input"
            />
          </div>

          {/* Client Name */}
          <div className="space-y-2">
            <Label htmlFor="client-name">Client Name (optional)</Label>
            <Input
              id="client-name"
              value={exportSettings.clientName}
              onChange={(e) => dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { clientName: e.target.value } })}
              placeholder="Company Name"
              className="bg-input"
            />
          </div>

          {/* Page Size & Orientation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Page Size</Label>
              <Select
                value={exportSettings.pageSize}
                onValueChange={(value: "A4" | "A3") =>
                  dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { pageSize: value } })
                }
              >
                <SelectTrigger className="bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="A3">A3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Orientation</Label>
              <Select
                value={exportSettings.orientation}
                onValueChange={(value: "portrait" | "landscape") =>
                  dispatch({ type: "UPDATE_EXPORT_SETTINGS", payload: { orientation: value } })
                }
              >
                <SelectTrigger className="bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview info */}
          <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">Layout Summary</p>
            <p className="text-muted-foreground">
              {layout.cabinets.length} cabinets • {bounds.width} × {bounds.height} mm • {widthPx} × {heightPx} px
            </p>
            <p className="text-muted-foreground">
              {layout.project.dataRoutes?.length || 0} data routes • {layout.project.powerFeeds?.length || 0} power
              feeds
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || layout.cabinets.length === 0}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 mr-2" />
                Export SVG
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
