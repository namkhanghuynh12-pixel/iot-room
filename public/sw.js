const CACHE = 'phong-iot-anime-v4-1440p';
const ASSETS = ['/', '/app.js', '/ui-state.js', '/style.css', '/icon.svg', '/manifest.webmanifest', '/poster.jpg', '/bg.mp4'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
async function offlineAsset(request) {
  const cached = await caches.match(new URL(request.url).pathname);
  if (!cached) return new Response('Không có dữ liệu ngoại tuyến', { status: 503 });
  const range = request.headers.get('range');
  if (!range || new URL(request.url).pathname !== '/bg.mp4') return cached;
  const data = await cached.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match && (match[1] || match[2]) ? (match[1] ? Number(match[1]) : Math.max(0, data.byteLength - Number(match[2]))) : NaN;
  const end = match && match[1] && match[2] ? Math.min(Number(match[2]), data.byteLength - 1) : data.byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= data.byteLength || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${data.byteLength}` } });
  return new Response(data.slice(start, end + 1), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${data.byteLength}`, 'Content-Length': String(end-start+1) } });
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Live data and controls always require the server; never replay cached commands.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET' || !ASSETS.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => offlineAsset(event.request)));
});
