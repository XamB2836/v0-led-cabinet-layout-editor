"use client"

import { EditorProvider } from "@/lib/editor-context"
import { TopBar } from "@/components/top-bar"
import { CabinetLibrary } from "@/components/cabinet-library"
import { LayoutCanvas } from "@/components/layout-canvas"
import { PropertiesPanel } from "@/components/properties-panel"
import { KeyboardHandler } from "@/components/keyboard-handler"

export default function Home() {
  return (
    <EditorProvider>
      <KeyboardHandler />
      <div className="h-screen flex flex-col bg-background">
        <TopBar />
        <div className="flex-1 flex min-h-0">
          <CabinetLibrary />
          <LayoutCanvas />
          <PropertiesPanel />
        </div>
      </div>
    </EditorProvider>
  )
}
