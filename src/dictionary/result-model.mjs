/**
 * Presentation-neutral helpers shared by the toolbar result component and
 * the Shadow DOM content popup renderer.
 */
export function findAudioEntryIndex(entries) {
  if (!Array.isArray(entries)) {
    return -1
  }

  return entries.findIndex(entry => (
    typeof entry?.audioUrl === 'string' && entry.audioUrl.trim() !== ''
  ))
}

/**
 * The toolbar popup has a compact result state and a taller, internally
 * scrollable state. Keep the threshold deterministic so both the shell and
 * the result renderer select the same Figma variant before layout.
 */
export function shouldUseScrollableResult(entries) {
  if (!Array.isArray(entries)) {
    return false
  }

  return entries.some(entry => {
    const meanings = Array.isArray(entry?.meanings) ? entry.meanings : []
    const textLength = meanings.reduce((total, meaning) => (
      total + String(meaning?.value || '').length
    ), 0)

    return meanings.length >= 3 || textLength > 180
  })
}
