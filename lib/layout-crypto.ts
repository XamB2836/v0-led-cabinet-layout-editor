import type { LayoutData } from "./types"

const SALT_BYTES = 16
const IV_BYTES = 12
const PBKDF2_ITERATIONS = 120000

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

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    out.set(chunk, offset)
    offset += chunk.length
  })
  return out
}

export async function encryptLayoutForUrl(layout: LayoutData, passphrase: string) {
  const encoder = new TextEncoder()
  const payload = encoder.encode(JSON.stringify(layout))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload)
  const combined = concatBytes([salt, iv, new Uint8Array(cipher)])
  return toBase64Url(bytesToBase64(combined))
}

export async function decryptLayoutFromUrl(payload: string, passphrase: string): Promise<LayoutData | null> {
  try {
    const combined = base64ToBytes(fromBase64Url(payload))
    if (combined.length <= SALT_BYTES + IV_BYTES) return null
    const salt = combined.slice(0, SALT_BYTES)
    const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
    const cipher = combined.slice(SALT_BYTES + IV_BYTES)
    const key = await deriveKey(passphrase, salt)
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher)
    const json = new TextDecoder().decode(plain)
    return JSON.parse(json) as LayoutData
  } catch {
    return null
  }
}
