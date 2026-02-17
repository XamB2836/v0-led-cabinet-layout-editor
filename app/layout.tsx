import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "LED Cabinet Layout Editor",
  description: "Visual editor for LED cabinet layouts - Export to JSON for SolidWorks",
  generator: "v0.app",
  icons: {
    icon: [{ url: "/nummax-dotmark.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/nummax-dotmark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/nummax-dotmark.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "LED Cabinet Layout Editor",
    description: "Visual editor for LED cabinet layouts - Export to JSON for SolidWorks",
    images: [{ url: "/nummax-dotmark.svg", width: 320, height: 320, alt: "Nummax Dot Logo" }],
  },
  twitter: {
    card: "summary",
    title: "LED Cabinet Layout Editor",
    description: "Visual editor for LED cabinet layouts - Export to JSON for SolidWorks",
    images: ["/nummax-dotmark.svg"],
  },
}

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
