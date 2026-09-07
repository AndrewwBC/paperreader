import { useSyncExternalStore } from 'react'
import { readNavigation, navigationHref } from '../utils/navigation.js'
export { navigationHref } from '../utils/navigation.js'

const subscribe = listener => {
  window.addEventListener('popstate', listener)
  window.addEventListener('paper-vault:navigate', listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener('paper-vault:navigate', listener)
  }
}

export function useNavigation() {
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return {
    route: readNavigation(search),
    navigate(route) {
      const href = navigationHref(route)
      if (href === window.location.pathname + window.location.search + window.location.hash) return
      window.history.pushState(null, '', href)
      window.dispatchEvent(new Event('paper-vault:navigate'))
    },
  }
}

export function followLink(event, navigate) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate()
}
