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
