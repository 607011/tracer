const CACHE_NAME = "tracer-cache-v1";
const urlsToCache = [
    "/index.html",
    "/js/game.js",
    "/static/fonts/RussoOne-Regular.ttf",
    "/static/images/favicon.png",
    "/static/images/favicon-32x32.png",
    "/static/images/favicon-256x256.png",
    "/static/sounds/alarm.mp3",
    "/static/sounds/countdown.mp3",
    "/static/sounds/step.mp3",
    "/static/sounds/tada.mp3",
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
