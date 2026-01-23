import type { LayoutData } from "./types"

function toBase64Url(base64: string) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(base64Url: string) {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4
  if (pad) {
    base64 += "=".repeat(4 - pad)
  }
  return base64
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function encodeLayoutToUrlParam(layout: LayoutData) {
  const json = JSON.stringify(layout)
  const bytes = new TextEncoder().encode(json)
  const base64 = bytesToBase64(bytes)
  return toBase64Url(base64)
}

export function decodeLayoutFromUrlParam(param: string): LayoutData | null {
  try {
    const base64 = fromBase64Url(param)
    const bytes = base64ToBytes(base64)
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as LayoutData
  } catch {
    return null
  }
}
