/**
 * Parses a project title into brand, cut, and type.
 *
 * Pattern: "<brand> <cut> <type words...>"
 *   where cut matches /^c\d+$/i  (e.g. c1, C3, c12)
 *
 * Examples:
 *   "mmh c1 custom"        → { brand: "MMH",   cut: "C1", type: "Custom" }
 *   "pat c3 three reasons" → { brand: "PAT",   cut: "C3", type: "Three Reasons" }
 *   "mmh c1"               → { brand: "MMH",   cut: "C1", type: "Uncategorized" }
 *   "anything weird"       → { brand: "Other", cut: "anything weird", type: "Uncategorized" }
 */
export function parseTitle(title) {
  const words = title.trim().split(/\s+/)
  const cutIndex = words.findIndex(w => /^c\d+$/i.test(w))

  if (cutIndex !== -1) {
    const brand = words[0].toUpperCase()
    const cut = words[cutIndex].toUpperCase()
    const rest = words.slice(cutIndex + 1)
    const type = rest.length > 0
      ? rest.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : 'Uncategorized'
    return { brand, cut, type }
  }

  return { brand: 'Other', cut: title, type: 'Uncategorized' }
}
