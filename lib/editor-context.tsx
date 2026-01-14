"use client"

import type React from "react"

import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react"
import type { Cabinet, CabinetType, LayoutData, EditorState } from "./types"
import { DEFAULT_LAYOUT } from "./types"

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
  | { type: "SET_ZOOM"; payload: number }
  | { type: "SET_PAN"; payload: { x: number; y: number } }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "PUSH_HISTORY" }

const MAX_HISTORY = 50

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_LAYOUT":
      return {
        ...state,
        layout: action.payload,
        selectedCabinetId: null,
        history: [action.payload],
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

    case "SET_ZOOM":
      return { ...state, zoom: Math.max(0.1, Math.min(5, action.payload)) }

    case "SET_PAN":
      return { ...state, panX: action.payload.x, panY: action.payload.y }

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
