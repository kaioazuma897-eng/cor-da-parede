/* Service worker do Cor da Parede (gerado no build a partir de pwa/sw.js). */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `cor-da-parede-${VERSION}`
const FONTS = 'cor-da-parede-fontes'

const scoped = (path) => new URL(path, self.registration.scope).href

// Servidores costumam responder com "Vary: Origin" ou "Vary: Accept-Encoding"; sem
// ignoreVary, um <script crossorigin> (que envia Origin) não encontra a cópia salva.
const fromCache = (req) => caches.match(req, { ignoreVary: true })

// Instala: baixa o app inteiro de uma vez, para funcionar offline a partir daí
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(scoped)))
      .then(() => self.skipWaiting()),
  )
})

// Ativa: apaga versões antigas do app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Fontes do Google: guarda na primeira vez que forem usadas
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true })
        if (hit) return hit
        const res = await fetch(req)
        cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // Página: tenta a rede (para pegar atualizações); sem internet, abre a versão salva
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => fromCache(scoped('./'))))
    return
  }

  // Arquivos do app têm hash no nome: a versão salva nunca fica desatualizada
  event.respondWith(fromCache(req).then((hit) => hit ?? fetch(req)))
})
