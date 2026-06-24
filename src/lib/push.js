// Push notifications — Web Push API + Supabase storage
// Para activar: genera VAPID keys con `npx web-push generate-vapid-keys`
// Agrega VITE_VAPID_PUBLIC_KEY en tu .env y en Cloudflare (o donde hosteas)

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function estadoPush() {
  if (!pushSoportado()) return 'no_soportado'
  const perm = Notification.permission
  if (perm === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  if (!reg) return 'sin_sw'
  const sub = await reg.pushManager.getSubscription().catch(() => null)
  return sub ? 'activo' : 'inactivo'
}

export async function activarPush(supabase, fabricaId, profileId) {
  if (!pushSoportado()) throw new Error('Push no soportado en este dispositivo')
  if (!VAPID_PUBLIC_KEY) throw new Error('Configura VITE_VAPID_PUBLIC_KEY en .env')

  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Permiso denegado por el usuario')

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  })

  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.from('bos_push_suscripciones').upsert(
    { fabrica_id: fabricaId, profile_id: profileId, endpoint, keys },
    { onConflict: 'profile_id,endpoint' }
  )
  if (error) throw error
  return sub
}

export async function desactivarPush(supabase, profileId) {
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const { endpoint } = sub.toJSON()
    await sub.unsubscribe()
    await supabase.from('bos_push_suscripciones')
      .delete()
      .eq('profile_id', profileId)
      .eq('endpoint', endpoint)
  }
}

// Notificación local (sin push — solo si la app está abierta)
export function notifLocal(titulo, body, url = '/') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const n = new Notification(titulo, {
    body,
    icon: '/icon-192.png',
    tag: 'boss-local'
  })
  n.onclick = () => { window.focus(); window.location.pathname = url }
}
