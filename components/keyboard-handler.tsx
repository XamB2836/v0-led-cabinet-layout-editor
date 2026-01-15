"use client"

import { useEffect } from "react"
import { useEditor } from "@/lib/editor-context"

export function KeyboardHandler() {
  const { state, dispatch } = useEditor()
  const { selectedCabinetId, layout } = state

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const selectedCabinet = layout.cabinets.find((c) => c.id === selectedCabinetId)

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCabinetId) {
          e.preventDefault()
          dispatch({ type: "DELETE_CABINET", payload: selectedCabinetId })
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      // Rotate
      if (e.key === "r" || e.key === "R") {
        if (selectedCabinet) {
          e.preventDefault()
          const newRot = ((selectedCabinet.rot_deg + 90) % 360) as 0 | 90 | 180 | 270
          dispatch({
            type: "UPDATE_CABINET",
            payload: { id: selectedCabinet.id, updates: { rot_deg: newRot } },
          })
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        dispatch({ type: "TOGGLE_DIMENSIONS" })
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        if (selectedCabinetId) {
          e.preventDefault()
          dispatch({ type: "DUPLICATE_CABINET", payload: selectedCabinetId })
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: "UNDO" })
      }

      // Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault()
        dispatch({ type: "REDO" })
      }

      // Arrow keys for nudging
      if (selectedCabinet && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? layout.project.grid.step_mm : 10
        let dx = 0,
          dy = 0
        if (e.key === "ArrowUp") dy = -step
        if (e.key === "ArrowDown") dy = step
        if (e.key === "ArrowLeft") dx = -step
        if (e.key === "ArrowRight") dx = step

        dispatch({
          type: "UPDATE_CABINET",
          payload: {
            id: selectedCabinet.id,
            updates: {
              x_mm: selectedCabinet.x_mm + dx,
              y_mm: selectedCabinet.y_mm + dy,
            },
          },
        })
        dispatch({ type: "PUSH_HISTORY" })
      }

      // Escape to deselect
      if (e.key === "Escape") {
        dispatch({ type: "SELECT_CABINET", payload: null })
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [dispatch, selectedCabinetId, layout])

  return null
}
