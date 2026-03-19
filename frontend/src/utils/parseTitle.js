/**
 * Parses a project title in the format: CL_[BRAND]_[CONCEPT]_[ADTYPE]_01_9x16
 *
 * Examples:
 *   "CL_HATO_C23_3REASONS_01_9x16" → { brand: "HATO", cut: "C23", type: "3Reasons" }
 *   "CL_MMH_C1_CUSTOM_01_9x16"     → { brand: "MMH",  cut: "C1",  type: "Custom" }
 *
 * Falls back to { brand: "Other", cut: title, type: "Uncategorized" } if fewer than 4 parts.
 */
export function parseTitle(title) {
  const parts = title.split('_')
  if (parts.length < 4) {
    return { brand: 'Other', cut: title, type: 'Uncategorized' }
  }

  const brand = parts[1].toUpperCase()
  const cut = parts[2].toUpperCase()
  const raw = parts[3].toLowerCase()
  const type = raw.replace(/[a-z]/, c => c.toUpperCase())

  return { brand, cut, type }
}
