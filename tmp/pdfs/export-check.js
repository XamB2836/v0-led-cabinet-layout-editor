const { chromium } = require("playwright")
const { pathToFileURL } = require("url")
const path = require("path")

const layout = {
  schemaVersion: 3,
  project: {
    mode: "outdoor",
    name: "NC6443",
    client: "Tremblay Menard",
    units: "mm",
    pitch_mm: 6.67,
    pitch_is_gob: false,
    controller: "A100",
    controllerLabel: "A100",
    controllerPlacement: "external",
    grid: { enabled: true, step_mm: 160 },
    overview: {
      showReceiverCards: true,
      receiverCardModel: "I5+",
      labelsMode: "grid",
      showCabinetLabels: true,
      gridLabelAxis: "columns",
      showPixels: true,
      showDataRoutes: true,
      forcePortLabelsBottom: false,
      showPowerRoutes: true,
      showModuleGrid: true,
      numberOfDisplays: 1,
      moduleSize: "320x320",
      moduleOrientation: "portrait",
      mappingNumbers: {
        show: false,
        mode: "auto",
        restartPerCard: true,
        labels: [1, 3, 5, 7, 9, 11, 13, 15],
        fontSize: "medium",
        position: "top-right",
        badge: true,
        manualValue: "",
        applyToChain: true,
        manualAssignments: { perChain: {}, perEndpoint: {} },
        positionOverrides: {},
      },
    },
    dataRoutes: [
      {
        id: "route-1",
        port: 1,
        cabinetIds: ["C01", "C02", "C03", "C06", "C05", "C04"],
      },
    ],
    powerFeeds: [
      {
        id: "feed-1",
        label: "220V 20A",
        breaker: "220V 20A",
        connector: "NAC3FX-W",
        consumptionW: 0,
        assignedCabinetIds: ["C03", "C02", "C01", "C04", "C05"],
        connectLvBox: true,
      },
    ],
    exportSettings: {
      pageSize: "A4",
      orientation: "portrait",
      viewSide: "front",
      title: "",
      clientName: "",
      showLegend: true,
      doubleSidedTitle: false,
    },
  },
  cabinetTypes: [
    { typeId: "OUT_960x640", width_mm: 960, height_mm: 640 },
    { typeId: "OUT_960x960", width_mm: 960, height_mm: 960 },
  ],
  cabinets: [
    { id: "C01", typeId: "OUT_960x960", x_mm: 0, y_mm: 640, rot_deg: 0 },
    { id: "C02", typeId: "OUT_960x960", x_mm: 960, y_mm: 640, rot_deg: 0 },
    { id: "C03", typeId: "OUT_960x960", x_mm: 1920, y_mm: 640, rot_deg: 0 },
    { id: "C04", typeId: "OUT_960x640", x_mm: 0, y_mm: 0, rot_deg: 0 },
    { id: "C05", typeId: "OUT_960x640", x_mm: 960, y_mm: 0, rot_deg: 0 },
    { id: "C06", typeId: "OUT_960x640", x_mm: 1920, y_mm: 0, rot_deg: 0 },
  ],
}

const layoutParam = Buffer.from(JSON.stringify(layout), "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "")

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  await page.goto(`http://127.0.0.1:3000/?layout=${layoutParam}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "PDF" }).click()
  const download = await downloadPromise
  const pdfPath = path.resolve("tmp/pdfs/repro.pdf")
  await download.saveAs(pdfPath)

  const pdfPage = await context.newPage()
  await pdfPage.goto(pathToFileURL(pdfPath).href, { waitUntil: "load", timeout: 120000 })
  await pdfPage.setViewportSize({ width: 1400, height: 1800 })
  await pdfPage.screenshot({ path: "tmp/pdfs/repro-page.png", fullPage: true })

  console.log(pdfPath)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
