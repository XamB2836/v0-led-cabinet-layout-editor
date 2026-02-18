import { DEFAULT_CABINET_TYPES, type CabinetType, type ModuleSize, type ProjectMode } from "./types"

type ModeRoutingProfile = "indoor_v1" | "outdoor_v1"

export interface ModeFeatures {
  dataRoutingProfile: ModeRoutingProfile
  powerRoutingProfile: ModeRoutingProfile
  supportsDoubleFace: boolean
}

export interface ModePitchOption {
  pitch_mm: number
  pitch_is_gob: boolean
  label: string
}

export interface ModeDefinition {
  id: ProjectMode
  label: string
  cabinetTypes: CabinetType[]
  pitchOptions: ModePitchOption[]
  defaultPitch: ModePitchOption
  moduleSizes: ModuleSize[]
  defaultModuleSize: ModuleSize
  features: ModeFeatures
}

const OUTDOOR_CABINET_TYPES: CabinetType[] = [
  { typeId: "OUT_960x320", width_mm: 960, height_mm: 320 },
  { typeId: "OUT_960x640", width_mm: 960, height_mm: 640 },
  { typeId: "OUT_960x960", width_mm: 960, height_mm: 960 },
  { typeId: "OUT_960x1280", width_mm: 960, height_mm: 1280 },
  { typeId: "OUT_1280x320", width_mm: 1280, height_mm: 320 },
  { typeId: "OUT_1280x640", width_mm: 1280, height_mm: 640 },
  { typeId: "OUT_1280x960", width_mm: 1280, height_mm: 960 },
  { typeId: "OUT_1280x1280", width_mm: 1280, height_mm: 1280 },
  { typeId: "OUT_1600x640", width_mm: 1600, height_mm: 640 },
  { typeId: "OUT_1600x960", width_mm: 1600, height_mm: 960 },
]

const INDOOR_PITCH_OPTIONS: ModePitchOption[] = [
  { pitch_mm: 1.25, pitch_is_gob: false, label: "P 1.25" },
  { pitch_mm: 1.25, pitch_is_gob: true, label: "P 1.25 GOB" },
  { pitch_mm: 1.56, pitch_is_gob: false, label: "P 1.56" },
  { pitch_mm: 1.56, pitch_is_gob: true, label: "P 1.56 GOB" },
  { pitch_mm: 1.86, pitch_is_gob: false, label: "P 1.86" },
  { pitch_mm: 1.86, pitch_is_gob: true, label: "P 1.86 GOB" },
  { pitch_mm: 2.5, pitch_is_gob: false, label: "P 2.5" },
  { pitch_mm: 2.5, pitch_is_gob: true, label: "P 2.5 GOB" },
  { pitch_mm: 4, pitch_is_gob: false, label: "P 4" },
  { pitch_mm: 4, pitch_is_gob: true, label: "P 4 GOB" },
  { pitch_mm: 5, pitch_is_gob: false, label: "P 5" },
  { pitch_mm: 5, pitch_is_gob: true, label: "P 5 GOB" },
]

const OUTDOOR_PITCH_OPTIONS: ModePitchOption[] = [
  { pitch_mm: 4, pitch_is_gob: false, label: "P 4" },
  { pitch_mm: 5, pitch_is_gob: false, label: "P 5" },
  { pitch_mm: 6.67, pitch_is_gob: false, label: "P 6.67" },
  { pitch_mm: 8, pitch_is_gob: false, label: "P 8" },
  { pitch_mm: 10, pitch_is_gob: false, label: "P 10" },
]

const MODE_DEFINITIONS: Record<ProjectMode, ModeDefinition> = {
  indoor: {
    id: "indoor",
    label: "Indoor",
    cabinetTypes: DEFAULT_CABINET_TYPES,
    pitchOptions: INDOOR_PITCH_OPTIONS,
    defaultPitch: { pitch_mm: 2.5, pitch_is_gob: true, label: "P 2.5 GOB" },
    moduleSizes: ["320x160", "160x160"],
    defaultModuleSize: "320x160",
    features: {
      dataRoutingProfile: "indoor_v1",
      powerRoutingProfile: "indoor_v1",
      supportsDoubleFace: false,
    },
  },
  outdoor: {
    id: "outdoor",
    label: "Outdoor",
    cabinetTypes: OUTDOOR_CABINET_TYPES,
    pitchOptions: OUTDOOR_PITCH_OPTIONS,
    defaultPitch: { pitch_mm: 6.67, pitch_is_gob: false, label: "P 6.67" },
    moduleSizes: ["320x320"],
    defaultModuleSize: "320x320",
    features: {
      dataRoutingProfile: "outdoor_v1",
      powerRoutingProfile: "outdoor_v1",
      supportsDoubleFace: true,
    },
  },
}

function cloneCabinetTypes(types: CabinetType[]) {
  return types.map((type) => ({ ...type }))
}

function clonePitchOptions(options: ModePitchOption[]) {
  return options.map((option) => ({ ...option }))
}

function isSamePitch(a: number, b: number) {
  return Math.abs(a - b) < 0.0001
}

export function coerceProjectMode(value: unknown): ProjectMode {
  return value === "outdoor" ? "outdoor" : "indoor"
}

export function getModeDefinition(mode: ProjectMode): ModeDefinition {
  const definition = MODE_DEFINITIONS[mode] ?? MODE_DEFINITIONS.indoor
  return {
    ...definition,
    cabinetTypes: cloneCabinetTypes(definition.cabinetTypes),
    pitchOptions: clonePitchOptions(definition.pitchOptions),
    defaultPitch: { ...definition.defaultPitch },
    moduleSizes: [...definition.moduleSizes],
    defaultModuleSize: definition.defaultModuleSize,
    features: { ...definition.features },
  }
}

export function getModeCabinetTypes(mode: ProjectMode): CabinetType[] {
  return cloneCabinetTypes(getModeDefinition(mode).cabinetTypes)
}

export function getModeOptions(): Array<{ value: ProjectMode; label: string }> {
  return (Object.keys(MODE_DEFINITIONS) as ProjectMode[]).map((mode) => ({
    value: mode,
    label: MODE_DEFINITIONS[mode].label,
  }))
}

export function getModePitchOptions(mode: ProjectMode): ModePitchOption[] {
  return clonePitchOptions(getModeDefinition(mode).pitchOptions)
}

export function coerceModePitch(mode: ProjectMode, pitch_mm: number, pitch_is_gob: boolean): ModePitchOption {
  const definition = getModeDefinition(mode)
  const exact = definition.pitchOptions.find(
    (option) => isSamePitch(option.pitch_mm, pitch_mm) && option.pitch_is_gob === pitch_is_gob,
  )
  return exact ? { ...exact } : { ...definition.defaultPitch }
}

export function getModeModuleSizeOptions(mode: ProjectMode): ModuleSize[] {
  return [...getModeDefinition(mode).moduleSizes]
}

export function coerceModeModuleSize(mode: ProjectMode, moduleSize: unknown): ModuleSize {
  const definition = getModeDefinition(mode)
  return definition.moduleSizes.includes(moduleSize as ModuleSize)
    ? (moduleSize as ModuleSize)
    : definition.defaultModuleSize
}

