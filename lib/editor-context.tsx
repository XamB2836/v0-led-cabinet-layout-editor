"use client"

import type React from "react"

import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react"
import type { Cabinet, CabinetType, LayoutData, EditorState, DataRoute, PowerFeed, RoutingMode } from "./types"
import { DEFAULT_LAYOUT } from "./types"
import { normalizeLayout } from "./layout-io"

type EditorAction =
  | { type: "SET_LAYOUT"; payload: LayoutData }
  | { type: "SELECT_CABINET"; payload: string | null }
  | { type: "ADD_CABINET"; payload: Cabinet }
  | { type: "UPDATE_CABINET"; payload: { id: string; updates: Partial<Cabinet> } }
  | { type: "DELETE_CABINET"; payload: string }
  | { type: "DUPLICATE_CABINET"; payload: string }
  | { type: "ADD_CABINET_TYPE"; payload: CabinetType }
  | { type: "DELETE_CABINET_TYPE"; payload: string }
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
  | { type: "ADD_CABINET_TO_ROUTE"; payload: { routeId: string; cabinetId: string } } // Add cabinet to data route
  | { type: "REMOVE_CABINET_FROM_ROUTE"; payload: { routeId: string; cabinetId: string } } // Remove cabinet from route
  | { type: "ADD_CABINET_TO_POWER_FEED"; payload: { feedId: string; cabinetId: string } } // Add cabinet to power feed
  | { type: "REMOVE_CABINET_FROM_POWER_FEED"; payload: { feedId: string; cabinetId: string } } // Remove from power
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "PUSH_HISTORY" }

const MAX_HISTORY = 50

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_LAYOUT":
      const normalized = normalizeLayout(action.payload)
      return {
        ...state,
        layout: normalized,
        selectedCabinetId: null,
        history: [normalized],
        historyIndex: 0,
      }

    case "SELECT_CABINET":
      return { ...state, selectedCabinetId: action.payload }

    case "ADD_CABINET":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: [...state.layout.cabinets, action.payload],
        },
        selectedCabinetId: action.payload.id,
      }

    case "UPDATE_CABINET":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: state.layout.cabinets.map((c) =>
            c.id === action.payload.id ? { ...c, ...action.payload.updates } : c,
          ),
        },
      }

    case "DELETE_CABINET":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: state.layout.cabinets.filter((c) => c.id !== action.payload),
        },
        selectedCabinetId: state.selectedCabinetId === action.payload ? null : state.selectedCabinetId,
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
      const offset = type ? type.width_mm : 100

      const newCabinet: Cabinet = {
        ...cabinet,
        id: newId,
        x_mm: cabinet.x_mm + offset,
      }

      return {
        ...state,
        layout: {
          ...state.layout,
          cabinets: [...state.layout.cabinets, newCabinet],
        },
        selectedCabinetId: newId,
      }
    }

    case "ADD_CABINET_TYPE":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinetTypes: [...state.layout.cabinetTypes, action.payload],
        },
      }

    case "DELETE_CABINET_TYPE":
      return {
        ...state,
        layout: {
          ...state.layout,
          cabinetTypes: state.layout.cabinetTypes.filter((t) => t.typeId !== action.payload),
        },
      }

    case "UPDATE_PROJECT":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: { ...state.layout.project, ...action.payload },
        },
      }

    case "UPDATE_OVERVIEW":
      return {
        ...state,
        layout: {
          ...state.layout,
          project: {
            ...state.layout.project,
            overview: { ...state.layout.project.overview, ...action.payload },
          },
        },
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

      const cabinetId = action.payload.cabinetId
      const isAlreadyInRoute = route.cabinetIds.includes(cabinetId)

      // Toggle: if already in route, remove it; otherwise add it
      const newCabinetIds = isAlreadyInRoute
        ? route.cabinetIds.filter((id) => id !== cabinetId)
        : [...route.cabinetIds, cabinetId]

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
                ? { ...r, cabinetIds: r.cabinetIds.filter((id) => id !== action.payload.cabinetId) }
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
              f.id === action.payload.feedId ? { ...f, assignedCabinetIds: newCabinetIds } : f,
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
                ? { ...f, assignedCabinetIds: f.assignedCabinetIds.filter((id) => id !== action.payload.cabinetId) }
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

    case "UNDO":
      if (state.historyIndex > 0) {
        return {
          ...state,
          historyIndex: state.historyIndex - 1,
          layout: JSON.parse(JSON.stringify(state.history[state.historyIndex - 1])),
          selectedCabinetId: null,
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

interface EditorContextValue {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>
  generateCabinetId: () => string
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState)

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

  return <EditorContext.Provider value={{ state, dispatch, generateCabinetId }}>{children}</EditorContext.Provider>
}

export function useEditor() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error("useEditor must be used within EditorProvider")
  }
  return context
}
