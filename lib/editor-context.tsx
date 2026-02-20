"use client"

import type React from "react"

import { createContext, useContext, useReducer, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { Cabinet, CabinetType, LayoutData, EditorState, DataRoute, PowerFeed, ProjectMode, RoutingMode } from "./types"
import { DEFAULT_LAYOUT } from "./types"
import { normalizeLayout } from "./layout-io"
import { decodeLayoutFromUrlParam } from "./layout-url"
import { coerceModeModuleSize, coerceModePitch, getModeCabinetTypes } from "./modes"

type EditorAction =
  | { type: "SET_LAYOUT"; payload: LayoutData }
  | { type: "SELECT_CABINET"; payload: string | null }
  | { type: "SET_CABINET_SELECTION"; payload: string[] }
  | { type: "TOGGLE_CABINET_SELECTION"; payload: string }
  | { type: "ADD_CABINET"; payload: Cabinet }
  | { type: "ADD_CABINETS"; payload: Cabinet[] }
  | { type: "UPDATE_CABINET"; payload: { id: string; updates: Partial<Cabinet> } }
  | { type: "UPDATE_CABINETS"; payload: { id: string; updates: Partial<Cabinet> }[] }
  | { type: "ROTATE_CABINETS_AS_BLOCK"; payload: string[] }
  | { type: "DELETE_CABINET"; payload: string }
  | { type: "DUPLICATE_CABINET"; payload: string }
  | { type: "ADD_CABINET_TYPE"; payload: CabinetType }
  | { type: "DELETE_CABINET_TYPE"; payload: string }
  | { type: "SET_PROJECT_MODE"; payload: ProjectMode }
  | { type: "UPDATE_PROJECT"; payload: Partial<LayoutData["project"]> }
  | { type: "UPDATE_OVERVIEW"; payload: Partial<LayoutData["project"]["overview"]> }
  | { type: "UPDATE_EXPORT_SETTINGS"; payload: Partial<LayoutData["project"]["exportSettings"]> }
  | { type: "ADD_DATA_ROUTE"; payload: DataRoute }
  | { type: "UPDATE_DATA_ROUTE"; payload: { id: string; updates: Partial<DataRoute> } }
  | { type: "DELETE_DATA_ROUTE"; payload: string }
  | { type: "ADD_POWER_FEED"; payload: PowerFeed }
  | { type: "UPDATE_POWER_FEED"; payload: { id: string; updates: Partial<PowerFeed> } }
  | { type: "DELETE_POWER_FEED"; payload: string }
  | { type: "SET_ZOOM"; payload: number }
  | { type: "SET_PAN"; payload: { x: number; y: number } }
  | { type: "TOGGLE_DIMENSIONS" }
  | { type: "SET_ROUTING_MODE"; payload: RoutingMode } // New action for routing mode
  | { type: "ADD_CABINET_TO_ROUTE"; payload: { routeId: string; endpointId: string } } // Add endpoint to data route
  | { type: "REMOVE_CABINET_FROM_ROUTE"; payload: { routeId: string; endpointId: string } } // Remove endpoint from route
  | { type: "ADD_CABINET_TO_POWER_FEED"; payload: { feedId: string; cabinetId: string } } // Add cabinet to power feed
  | { type: "REMOVE_CABINET_FROM_POWER_FEED"; payload: { feedId: string; cabinetId: string } } // Remove from power
  | { type: "RESET_EDITOR" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "PUSH_HISTORY" }
  | {
      type: "RESTORE_EDITOR_STATE"
      payload: {
        layout: LayoutData
        zoom?: number
        panX?: number
        panY?: number
        showDimensions?: boolean
      }
    }

const MAX_HISTORY = 50

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_LAYOUT":
      const normalized = normalizeLayout(action.payload)
      return {
        ...state,
        layout: normalized,
        selectedCabinetId: null,
        selectedCabinetIds: [],
        history: [normalized],
        historyIndex: 0,
      }

    case "RESTORE_EDITOR_STATE": {
      const normalized = normalizeLayout(action.payload.layout)
      return {
        ...state,
        layout: normalized,
        history: [normalized],
        historyIndex: 0,
        zoom: action.payload.zoom ?? state.zoom,
        panX: action.payload.panX ?? state.panX,
        panY: action.payload.panY ?? state.panY,
        showDimensions: action.payload.showDimensions ?? state.showDimensions,
        selectedCabinetId: null,
        selectedCabinetIds: [],
        isDragging: false,
        draggedCabinetId: null,
        routingMode: { type: "none" },
      }
    }

    case "SELECT_CABINET":
      return {
        ...state,
        selectedCabinetId: action.payload,
        selectedCabinetIds: action.payload ? [action.payload] : [],
      }

    case "SET_CABINET_SELECTION": {
      const ids = action.payload
      return {
        ...state,
        selectedCabinetId: ids.length > 0 ? ids[ids.length - 1] : null,
        selectedCabinetIds: ids,
      }
    }

    case "TOGGLE_CABINET_SELECTION": {
      const exists = state.selectedCabinetIds.includes(action.payload)
      const nextIds = exists
        ? state.selectedCabinetIds.filter((id) => id !== action.payload)
        : [...state.selectedCabinetIds, action.payload]
      let nextPrimary = state.selectedCabinetId
      if (!exists) {
        nextPrimary = action.payload
      } else if (state.selectedCabinetId === action.payload) {
        nextPrimary = nextIds[0] ?? null
      }
      return {
        ...state,
        selectedCabinetId: nextPrimary,
        selectedCabinetIds: nextIds,
      }
    }

    case "ADD_CABINET":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: [...state.layout.cabinets, action.payload],
        },
        selectedCabinetId: action.payload.id,
        selectedCabinetIds: [action.payload.id],
      }

    case "ADD_CABINETS": {
      if (action.payload.length === 0) return state
      const ids = action.payload.map((cabinet) => cabinet.id)
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: [...state.layout.cabinets, ...action.payload],
        },
        selectedCabinetId: ids[ids.length - 1] ?? null,
        selectedCabinetIds: ids,
      }
    }

    case "UPDATE_CABINET": {
      const nextCabinets = state.layout.cabinets.map((c) =>
        c.id === action.payload.id
          ? {
              ...c,
              ...action.payload.updates,
              ...((state.layout.project.mode ?? "indoor") === "outdoor" ? { rot_deg: 0 as const } : {}),
            }
          : c,
      )
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: nextCabinets,
        },
      }
    }

    case "UPDATE_CABINETS": {
      if (action.payload.length === 0) return state
      const updatesById = new Map(action.payload.map((entry) => [entry.id, entry.updates]))
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: state.layout.cabinets.map((c) => {
            const updates = updatesById.get(c.id)
            if (!updates) return c
            return {
              ...c,
              ...updates,
              ...((state.layout.project.mode ?? "indoor") === "outdoor" ? { rot_deg: 0 as const } : {}),
            }
          }),
        },
      }
    }

    case "ROTATE_CABINETS_AS_BLOCK": {
      if ((state.layout.project.mode ?? "indoor") === "outdoor") return state
      const selected = Array.from(new Set(action.payload))
        .map((id) => state.layout.cabinets.find((c) => c.id === id))
        .filter((cabinet): cabinet is Cabinet => !!cabinet)
      if (selected.length === 0) return state

      if (selected.length === 1) {
        const cabinet = selected[0]
        const newRot = ((cabinet.rot_deg + 90) % 360) as 0 | 90 | 180 | 270
        return {
          ...state,
          layout: {
            ...state.layout,
            cabinets: state.layout.cabinets.map((c) => (c.id === cabinet.id ? { ...c, rot_deg: newRot } : c)),
          },
        }
      }

      const step = state.layout.project.grid.step_mm
      const snap = (value: number) => Math.round(value / step) * step
      const getCabinetSize = (cabinet: Cabinet, rot: 0 | 90 | 180 | 270) => {
        const type = state.layout.cabinetTypes.find((t) => t.typeId === cabinet.typeId)
        const isRotated = rot === 90 || rot === 270
        return {
          width: type ? (isRotated ? type.height_mm : type.width_mm) : 100,
          height: type ? (isRotated ? type.width_mm : type.height_mm) : 100,
        }
      }

      const bounds = selected.map((cabinet) => {
        const size = getCabinetSize(cabinet, cabinet.rot_deg)
        return {
          cabinet,
          x: cabinet.x_mm,
          y: cabinet.y_mm,
          width: size.width,
          height: size.height,
          centerX: cabinet.x_mm + size.width / 2,
          centerY: cabinet.y_mm + size.height / 2,
        }
      })
      const minX = Math.min(...bounds.map((b) => b.x))
      const minY = Math.min(...bounds.map((b) => b.y))
      const maxX = Math.max(...bounds.map((b) => b.x + b.width))
      const maxY = Math.max(...bounds.map((b) => b.y + b.height))
      const groupCenterX = (minX + maxX) / 2
      const groupCenterY = (minY + maxY) / 2

      const updatesById = new Map<
        string,
        {
          rot_deg: 0 | 90 | 180 | 270
          x_mm: number
          y_mm: number
        }
      >()

      bounds.forEach((entry) => {
        const newRot = ((entry.cabinet.rot_deg + 90) % 360) as 0 | 90 | 180 | 270
        const newSize = getCabinetSize(entry.cabinet, newRot)
        const relX = entry.centerX - groupCenterX
        const relY = entry.centerY - groupCenterY
        const rotatedCenterX = groupCenterX - relY
        const rotatedCenterY = groupCenterY + relX
        updatesById.set(entry.cabinet.id, {
          rot_deg: newRot,
          x_mm: snap(rotatedCenterX - newSize.width / 2),
          y_mm: snap(rotatedCenterY - newSize.height / 2),
        })
      })

      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: state.layout.cabinets.map((c) => {
            const updates = updatesById.get(c.id)
            return updates ? { ...c, ...updates } : c
          }),
        },
      }
    }

    case "DELETE_CABINET":
      const remainingSelection = state.selectedCabinetIds.filter((id) => id !== action.payload)
      const isControllerCabinet =
        state.layout.project.controllerPlacement === "cabinet" &&
        state.layout.project.controllerCabinetId === action.payload
      const isOutdoorMode = (state.layout.project.mode ?? "indoor") === "outdoor"
      const fallbackPlacement: "cabinet" | "external" = isOutdoorMode ? "cabinet" : "external"
      const nextProject = isControllerCabinet
        ? {
            ...state.layout.project,
            controllerPlacement: fallbackPlacement,
            controllerCabinetId: undefined,
          }
        : state.layout.project
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: state.layout.cabinets.filter((c) => c.id !== action.payload),
          project: nextProject,
        },
        selectedCabinetId:
          state.selectedCabinetId === action.payload ? remainingSelection[0] ?? null : state.selectedCabinetId,
        selectedCabinetIds: remainingSelection,
      }

    case "DUPLICATE_CABINET": {
      const cabinet = state.layout.cabinets.find((c) => c.id === action.payload)
      if (!cabinet) return state

      const existingIds = state.layout.cabinets.map((c) => c.id)
      let newId = `C${String(state.layout.cabinets.length + 1).padStart(2, "0")}`
      let counter = state.layout.cabinets.length + 1
      while (existingIds.includes(newId)) {
        counter++
        newId = `C${String(counter).padStart(2, "0")}`
      }

      const type = state.layout.cabinetTypes.find((t) => t.typeId === cabinet.typeId)
      const isRotated = cabinet.rot_deg === 90 || cabinet.rot_deg === 270
      const width = type ? (isRotated ? type.height_mm : type.width_mm) : 100

      const newCabinet: Cabinet = {
        ...cabinet,
        id: newId,
        x_mm: cabinet.x_mm + width,
      }

      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: [...state.layout.cabinets, newCabinet],
        },
        selectedCabinetId: newId,
        selectedCabinetIds: [newId],
      }
    }

    case "ADD_CABINET_TYPE":
      if ((state.layout.project.mode ?? "indoor") === "outdoor") return state
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinetTypes: [...state.layout.cabinetTypes, action.payload],
        },
      }

    case "DELETE_CABINET_TYPE":
      if ((state.layout.project.mode ?? "indoor") === "outdoor") return state
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinetTypes: state.layout.cabinetTypes.filter((t) => t.typeId !== action.payload),
        },
      }

    case "SET_PROJECT_MODE": {
      const mode = action.payload
      if ((state.layout.project.mode ?? "indoor") === mode) return state

      const modeTypes = getModeCabinetTypes(mode)
      const nextControllerPlacement: "cabinet" | "external" = mode === "outdoor" ? "cabinet" : "external"
      const baseLayout = normalizeLayout({
        ...DEFAULT_LAYOUT,
        project: {
          ...DEFAULT_LAYOUT.project,
          mode,
          // Keep project identity fields while resetting the design.
          name: state.layout.project.name,
          client: state.layout.project.client,
          controllerPlacement: nextControllerPlacement,
          controllerCabinetId: undefined,
        },
        cabinetTypes: modeTypes,
        cabinets: [],
      })

      return {
        ...state,
        layout: baseLayout,
        selectedCabinetId: null,
        selectedCabinetIds: [],
        routingMode: { type: "none" },
      }
    }

    case "UPDATE_PROJECT": {
      const nextProject = { ...state.layout.project, ...action.payload }
      const mode = nextProject.mode ?? "indoor"
      const coercedPitch = coerceModePitch(mode, nextProject.pitch_mm, nextProject.pitch_is_gob)
      const normalizedProject = {
        ...nextProject,
        pitch_mm: coercedPitch.pitch_mm,
        pitch_is_gob: coercedPitch.pitch_is_gob,
      }
      return {
        ...state,
        layout: {
          ...state.layout,
          project: normalizedProject,
        },
      }
    }

    case "UPDATE_OVERVIEW": {
      const mode = state.layout.project.mode ?? "indoor"
      const nextOverview = { ...state.layout.project.overview, ...action.payload }
      const normalizedOverview = {
        ...nextOverview,
        moduleSize: coerceModeModuleSize(mode, nextOverview.moduleSize),
      }
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            overview: normalizedOverview,
          },
        },
      }
    }

    case "UPDATE_EXPORT_SETTINGS":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            exportSettings: { ...state.layout.project.exportSettings, ...action.payload },
          },
        },
      }

    case "ADD_DATA_ROUTE":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            dataRoutes: [...state.layout.project.dataRoutes, action.payload],
          },
        },
      }

    case "UPDATE_DATA_ROUTE":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            dataRoutes: state.layout.project.dataRoutes.map((r) =>
              r.id === action.payload.id ? { ...r, ...action.payload.updates } : r,
            ),
          },
        },
      }

    case "DELETE_DATA_ROUTE":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            dataRoutes: state.layout.project.dataRoutes.filter((r) => r.id !== action.payload),
          },
        },
      }

    case "ADD_POWER_FEED":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            powerFeeds: [...state.layout.project.powerFeeds, action.payload],
          },
        },
      }

    case "UPDATE_POWER_FEED":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            powerFeeds: state.layout.project.powerFeeds.map((f) =>
              f.id === action.payload.id ? { ...f, ...action.payload.updates } : f,
            ),
          },
        },
      }

    case "DELETE_POWER_FEED":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            powerFeeds: state.layout.project.powerFeeds.filter((f) => f.id !== action.payload),
          },
        },
      }

    case "SET_ZOOM":
      return { ...state, zoom: Math.max(0.1, Math.min(5, action.payload)) }

    case "SET_PAN":
      return { ...state, panX: action.payload.x, panY: action.payload.y }

    case "TOGGLE_DIMENSIONS":
      return { ...state, showDimensions: !state.showDimensions }

    case "SET_ROUTING_MODE":
      return { ...state, routingMode: action.payload }

    case "ADD_CABINET_TO_ROUTE": {
      const route = state.layout.project.dataRoutes.find((r) => r.id === action.payload.routeId)
      if (!route) return state

      const endpointId = action.payload.endpointId
      const isAlreadyInRoute = route.cabinetIds.includes(endpointId)

      // Toggle: if already in route, remove it; otherwise add it
      const newCabinetIds = isAlreadyInRoute
        ? route.cabinetIds.filter((id) => id !== endpointId)
        : [...route.cabinetIds, endpointId]

      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            dataRoutes: state.layout.project.dataRoutes.map((r) =>
              r.id === action.payload.routeId ? { ...r, cabinetIds: newCabinetIds } : r,
            ),
          },
        },
      }
    }

    case "REMOVE_CABINET_FROM_ROUTE": {
      const route = state.layout.project.dataRoutes.find((r) => r.id === action.payload.routeId)
      if (!route) return state

      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            dataRoutes: state.layout.project.dataRoutes.map((r) =>
              r.id === action.payload.routeId
                ? { ...r, cabinetIds: r.cabinetIds.filter((id) => id !== action.payload.endpointId) }
                : r,
            ),
          },
        },
      }
    }

    case "ADD_CABINET_TO_POWER_FEED": {
      const feed = state.layout.project.powerFeeds.find((f) => f.id === action.payload.feedId)
      if (!feed) return state

      const cabinetId = action.payload.cabinetId
      const isAlreadyInFeed = feed.assignedCabinetIds.includes(cabinetId)

      const newCabinetIds = isAlreadyInFeed
        ? feed.assignedCabinetIds.filter((id) => id !== cabinetId)
        : [...feed.assignedCabinetIds, cabinetId]

      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            powerFeeds: state.layout.project.powerFeeds.map((f) =>
              f.id === action.payload.feedId ? { ...f, assignedCabinetIds: newCabinetIds, connectLvBox: false } : f,
            ),
          },
        },
      }
    }

    case "REMOVE_CABINET_FROM_POWER_FEED": {
      const feed = state.layout.project.powerFeeds.find((f) => f.id === action.payload.feedId)
      if (!feed) return state

      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            powerFeeds: state.layout.project.powerFeeds.map((f) =>
              f.id === action.payload.feedId
                ? {
                    ...f,
                    assignedCabinetIds: f.assignedCabinetIds.filter((id) => id !== action.payload.cabinetId),
                    connectLvBox: false,
                  }
                : f,
            ),
          },
        },
      }
    }

    case "PUSH_HISTORY": {
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(JSON.parse(JSON.stringify(state.layout)))
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift()
      }
      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    case "RESET_EDITOR": {
      const normalized = normalizeLayout(DEFAULT_LAYOUT)
      return {
        ...initialState,
        layout: normalized,
        history: [normalized],
        historyIndex: 0,
      }
    }

    case "UNDO":
      if (state.historyIndex > 0) {
        return {
          ...state,
          historyIndex: state.historyIndex - 1,
          layout: JSON.parse(JSON.stringify(state.history[state.historyIndex - 1])),
          selectedCabinetId: null,
          selectedCabinetIds: [],
        }
      }
      return state

    case "REDO":
      if (state.historyIndex < state.history.length - 1) {
        return {
          ...state,
          historyIndex: state.historyIndex + 1,
          layout: JSON.parse(JSON.stringify(state.history[state.historyIndex + 1])),
          selectedCabinetId: null,
          selectedCabinetIds: [],
        }
      }
      return state

    default:
      return state
  }
}

const initialState: EditorState = {
  layout: DEFAULT_LAYOUT,
  selectedCabinetId: null,
  selectedCabinetIds: [],
  zoom: 0.5,
  panX: 100,
  panY: 100,
  isDragging: false,
  draggedCabinetId: null,
  history: [DEFAULT_LAYOUT],
  historyIndex: 0,
  showDimensions: true,
  routingMode: { type: "none" }, // Initialize routing mode
}

const STORAGE_KEY = "led-layout-editor:v1"

interface EditorContextValue {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  generateCabinetId: () => string
  resetEditor: () => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState)
  const hasRestoredRef = useRef(false)

  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true
    if (typeof window === "undefined") return
    const restoreFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as {
          layout?: LayoutData
          zoom?: number
          panX?: number
          panY?: number
          showDimensions?: boolean
        }
        if (!parsed.layout) return
        dispatch({
          type: "RESTORE_EDITOR_STATE",
          payload: {
            layout: parsed.layout,
            zoom: parsed.zoom,
            panX: parsed.panX,
            panY: parsed.panY,
            showDimensions: parsed.showDimensions,
          },
        })
      } catch {
        return
      }
    }

    const searchParams = new URLSearchParams(window.location.search)
    const layoutParam = searchParams.get("layout")
    if (layoutParam) {
      const loadFromParam = async () => {
        const decoded = decodeLayoutFromUrlParam(layoutParam)
        if (!decoded) return false
        dispatch({ type: "SET_LAYOUT", payload: decoded })
        searchParams.delete("layout")
        const nextQuery = searchParams.toString()
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
        window.history.replaceState({}, "", nextUrl)
        return true
      }

      loadFromParam().then((loaded) => {
        if (!loaded) restoreFromStorage()
      })
      return
    }

    restoreFromStorage()
  }, [])

  const generateCabinetId = useCallback(() => {
    const existingIds = state.layout.cabinets.map((c) => c.id)
    let counter = state.layout.cabinets.length + 1
    let newId = `C${String(counter).padStart(2, "0")}`
    while (existingIds.includes(newId)) {
      counter++
      newId = `C${String(counter).padStart(2, "0")}`
    }
    return newId
  }, [state.layout.cabinets])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handle = window.setTimeout(() => {
      const payload = {
        layout: state.layout,
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        showDimensions: state.showDimensions,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }, 400)
    return () => window.clearTimeout(handle)
  }, [state.layout, state.zoom, state.panX, state.panY, state.showDimensions])

  const resetEditor = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    dispatch({ type: "RESET_EDITOR" })
  }, [dispatch])

  return (
    <EditorContext.Provider value={{ state, dispatch, generateCabinetId, resetEditor }}>
      {children}
    </EditorContext.Provider>
  )
}

export function useEditor() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error("useEditor must be used within EditorProvider")
  }
  return context
}
