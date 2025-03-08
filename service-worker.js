const CACHE_NAME = "tracer-cache-v1";
const urlsToCache = [
    "/index.html",
    "/static/js/game.min.js",
    "/static/fonts/RussoOne-Regular.ttf",
    "/static/images/favicon.png",
    "/static/images/favicon-32x32.png",
    "/static/images/favicon-48x48.png",
    "/static/images/favicon-64x64.png",
    "/static/images/favicon-96x96.png",
    "/static/images/favicon-120x120.png",
    "/static/images/favicon-128x128.png",
    "/static/images/favicon-152x152.png",
    "/static/images/favicon-167x167.png",
    "/static/images/favicon-180x180.png",
    "/static/images/favicon-192x192.png",
    "/static/images/favicon-256x256.png",
    "/static/images/favicon-384x384.png",
    "/static/images/favicon-512x512.png",
    "/static/images/favicon-1024x1024.png",
    "/static/sounds/alarm.mp3",
    "/static/sounds/countdown.mp3",
    "/static/sounds/step.mp3",
    "/static/sounds/tada.mp3",
    "/static/sounds/pip.mp3",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .catch(e => console.error(e)) 
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
