/** Scoped inline stylesheet for the reach settings tab. */

export function installReachStyles(): () => void {
  const id = 'dsh-reach-client-styles'
  if (document.getElementById(id)) return () => {}
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
.reach-panel { display: flex; flex-direction: column; gap: 8px; }
.reach-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.reach-row-label { opacity: 0.8; }
.reach-actions { display: flex; gap: 8px; }
.reach-error { color: var(--color-danger, #d33); }
.reach-hint { opacity: 0.7; font-size: 0.9em; }
`
  document.head.appendChild(style)
  return () => style.remove()
}
