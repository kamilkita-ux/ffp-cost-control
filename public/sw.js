// Service Worker — FFP Cost Control
//
// Cel: żeby aplikacja, dodana do ekranu głównego telefonu/iPada, otwierała
// się od razu (jak natywna appka), nawet przy słabym/zerowym internecie —
// ale WYŁĄCZNIE dla powłoki interfejsu (HTML/ikony/manifest), NIGDY dla
// danych finansowych.
//
// /api/* jest celowo pomijane w cache'owaniu — to narzędzie kontrolingowe
// pokazuje realne kwoty (koszty, przychody, wynik firmy). Pokazanie
// nieaktualnych liczb "po cichu" (bo są w cache) byłoby gorsze niż
// widoczny błąd braku połączenia — dlatego dane zawsze idą prosto do
// sieci, bez cache.
const CACHE_NAME = "ffp-shell-v1";
const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Dane (API): zawsze sieć, nigdy cache — patrz komentarz wyżej.
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;

  // Powłoka aplikacji: stale-while-revalidate — natychmiastowe otwarcie
  // z cache, a w tle pobranie świeższej wersji na następne uruchomienie.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((response) => {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
