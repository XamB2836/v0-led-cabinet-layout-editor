const P156_DISPLAY = 1.56
const P156_EFFECTIVE = 1.568627
const PITCH_TOLERANCE = 0.001

export function getEffectivePitchMm(pitchMm: number) {
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) return pitchMm
  if (Math.abs(pitchMm - P156_DISPLAY) <= PITCH_TOLERANCE) return P156_EFFECTIVE
  return pitchMm
}
