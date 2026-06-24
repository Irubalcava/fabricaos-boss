const CACHE_V = 'boss-v2'
const PRECACHE = ['/', '/index.html']

// Instalar y cachear shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_V).then(c => c.addAll(PRECACHE).catch(() => {}))
  )
  self.skipWaiting()
})

// Activar y limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_V).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network first, cache fallback (excepto APIs externas)
self.addEventListener('fetch', e => {
  const url = e.request.url
  if (
    url.includes('supabase.co') ||
    url.includes('anthropic.com') ||
    url.includes('graph.facebook.com') ||
    url.includes('googleapis.com') ||
    e.request.method !== 'GET'
  ) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE_V).then(c => c.put(e.request, clone))
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// Push notifications
self.addEventListener('push', e => {
  let data = { title: 'Business OS', body: '', url: '/', tag: 'boss' }
  try { data = { ...data, ...e.data?.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url },
      requireInteraction: !!data.requireInteraction,
      vibrate: [200, 100, 200],
      actions: data.actions || []
    })
  )
})

// Click en notificación → abrir la URL
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.startsWith(self.location.origin))
      if (existing) { existing.navigate(url); return existing.focus() }
      return clients.openWindow(url)
    })
  )
})

// Mensaje desde la app
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
