export type ReceiverCardModelOption = {
  id: string
  label: string
  width_px: number
  height_px: number
}

export const DEFAULT_RECEIVER_CARD_MODEL = "5A75-E"

export const RECEIVER_CARD_MODELS: ReceiverCardModelOption[] = [
  { id: "5A75-E", label: "5A75-E", width_px: 256, height_px: 1024 },
  { id: "I5+", label: "I5+", width_px: 512, height_px: 384 },
]

export function formatReceiverCardOptionLabel(option: ReceiverCardModelOption) {
  return `${option.label} (${option.width_px} x ${option.height_px} px)`
}
