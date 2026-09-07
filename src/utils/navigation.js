const tabs = new Set(['reading', 'highlights', 'form', 'json', 'cite'])

export function readNavigation(search) {
  const params = new URLSearchParams(search)
  const studyId = params.get('study') || null
  const paperId = params.get('paper') || null
  const annotationId = paperId ? params.get('annotation') || null : null
  const tab = annotationId ? 'highlights' : tabs.has(params.get('tab')) ? params.get('tab') : 'reading'
  const view = paperId && params.get('view') !== 'cards' ? 'editor' : studyId || paperId ? 'cards' : 'home'
  return { studyId, paperId, annotationId, tab, view }
}

export function navigationHref(route, current = window.location.href) {
  const url = new URL(current)
  for (const key of ['study', 'paper', 'annotation', 'tab', 'view']) url.searchParams.delete(key)
  if (route.studyId) url.searchParams.set('study', route.studyId)
  if (route.paperId) {
    url.searchParams.set('paper', route.paperId)
    if (route.annotationId != null) url.searchParams.set('annotation', route.annotationId)
    if (route.tab && route.tab !== 'reading' && tabs.has(route.tab)) url.searchParams.set('tab', route.tab)
    if (route.view === 'cards') url.searchParams.set('view', 'cards')
  }
  return url.pathname + url.search + url.hash
}
