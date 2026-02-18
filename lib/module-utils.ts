import type { ModuleSize } from "./types"

export function getBaseModuleSize(moduleSize: ModuleSize | undefined) {
  switch (moduleSize) {
    case "160x160":
      return { width: 160, height: 160 }
    case "320x320":
      return { width: 320, height: 320 }
    default:
      return { width: 320, height: 160 }
  }
}

export function getOrientedModuleSize(
  moduleSize: ModuleSize | undefined,
  moduleOrientation: "landscape" | "portrait" | undefined,
) {
  const baseModule = getBaseModuleSize(moduleSize)
  const orientation = moduleOrientation ?? "portrait"
  const moduleWidth = orientation === "portrait" ? baseModule.height : baseModule.width
  const moduleHeight = orientation === "portrait" ? baseModule.width : baseModule.height
  return {
    baseModule,
    moduleWidth,
    moduleHeight,
    moduleOrientation: orientation,
  }
}
