"use client"

import { useEffect, useRef } from "react"
import { useEditor } from "@/lib/editor-context"
import { getCabinetBounds } from "@/lib/validation"
import type { Cabinet } from "@/lib/types"

export function KeyboardHandler() {
  const { state, dispatch } = useEditor()
  const { selectedCabinetId, selectedCabinetIds, layout } = state
  const clipboardRef = useRef<Cabinet[]>([])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = e.key.toLowerCase()
      const selection = selectedCabinetIds.length > 0
        ? selectedCabinetIds
        : selectedCabinetId
          ? [selectedCabinetId]
          : []

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection.length > 0) {
          e.preventDefault()
          selection.forEach((id) => dispatch({ type: "DELETE_CABINET", payload: id }))
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      // Rotate
      if (key === "r") {
        if (selection.length > 0 && (layout.project.mode ?? "indoor") !== "outdoor") {
          e.preventDefault()
          dispatch({ type: "ROTATE_CABINETS_AS_BLOCK", payload: selection })
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      if (key === "d" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        dispatch({ type: "TOGGLE_DIMENSIONS" })
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && key === "d") {
        if (selection.length > 0) {
          e.preventDefault()
          const existingIds = new Set(layout.cabinets.map((c) => c.id))
          let counter = layout.cabinets.length + 1
          const nextId = () => {
            let newId = `C${String(counter).padStart(2, "0")}`
            while (existingIds.has(newId)) {
              counter++
              newId = `C${String(counter).padStart(2, "0")}`
            }
            existingIds.add(newId)
            counter++
            return newId
          }
          const selected = Array.from(new Set(selection))
            .map((id) => layout.cabinets.find((c) => c.id === id))
            .filter((cabinet): cabinet is Cabinet => !!cabinet)
          if (selected.length === 0) return
          const selectedBounds = selected.map((cabinet) => ({
            cabinet,
            bounds: getCabinetBounds(cabinet, layout.cabinetTypes),
          }))
          const minX = Math.min(
            ...selectedBounds.map(({ cabinet, bounds }) => (bounds ? bounds.x : cabinet.x_mm)),
          )
          const maxX = Math.max(
            ...selectedBounds.map(({ cabinet, bounds }) => (bounds ? bounds.x2 : cabinet.x_mm + 100)),
          )
          const offsetX = Math.max(layout.project.grid.step_mm, maxX - minX)

          const additions = selected.map((cabinet) => ({
            ...cabinet,
            id: nextId(),
            x_mm: cabinet.x_mm + offsetX,
          }))
          if (additions.length > 0) {
            dispatch({ type: "ADD_CABINETS", payload: additions })
            dispatch({ type: "PUSH_HISTORY" })
          }
        }
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && key === "c") {
        if (selection.length > 0) {
          e.preventDefault()
          clipboardRef.current = layout.cabinets
            .filter((c) => selection.includes(c.id))
            .map((c) => ({ ...c }))
        }
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && key === "v") {
        if (clipboardRef.current.length > 0) {
          e.preventDefault()
          const existingIds = new Set(layout.cabinets.map((c) => c.id))
          let counter = layout.cabinets.length + 1
          const nextId = () => {
            let newId = `C${String(counter).padStart(2, "0")}`
            while (existingIds.has(newId)) {
              counter++
              newId = `C${String(counter).padStart(2, "0")}`
            }
            existingIds.add(newId)
            counter++
            return newId
          }
          const offset = layout.project.grid.step_mm
          const additions = clipboardRef.current.map((cabinet) => ({
            ...cabinet,
            id: nextId(),
            x_mm: cabinet.x_mm + offset,
            y_mm: cabinet.y_mm + offset,
          }))
          dispatch({ type: "ADD_CABINETS", payload: additions })
          dispatch({ type: "PUSH_HISTORY" })
        }
      }

      // Undo
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: "UNDO" })
      }

      // Redo
      if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault()
        dispatch({ type: "REDO" })
      }

      // Arrow keys for nudging
      if (selection.length > 0 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? layout.project.grid.step_mm : 10
        let dx = 0,
          dy = 0
        if (e.key === "ArrowUp") dy = -step
        if (e.key === "ArrowDown") dy = step
        if (e.key === "ArrowLeft") dx = -step
        if (e.key === "ArrowRight") dx = step

        selection.forEach((id) => {
          const cabinet = layout.cabinets.find((c) => c.id === id)
          if (!cabinet) return
          dispatch({
            type: "UPDATE_CABINET",
            payload: {
              id: cabinet.id,
              updates: {
                x_mm: cabinet.x_mm + dx,
                y_mm: cabinet.y_mm + dy,
              },
            },
          })
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
  }, [dispatch, selectedCabinetId, selectedCabinetIds, layout])

  return null
}


