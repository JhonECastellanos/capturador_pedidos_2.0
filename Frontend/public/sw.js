// Synchronic.JO V8P4. No guarda respuestas, sesiones ni documentos del negocio.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = new URL(event.notification.data?.ruta || '/admin/notificaciones', self.location.origin);
  if (destino.origin !== self.location.origin || !/^\/admin(?:\/|$)/.test(destino.pathname)) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async ventanas => {
    const ventana = ventanas.find(v => new URL(v.url).origin === self.location.origin);
    if (ventana) { ventana.postMessage({ tipo: 'abrir-notificacion', ruta: destino.pathname + destino.search }); await ventana.focus(); }
    else await self.clients.openWindow(destino.href);
  }));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synchronic.JO</title><body style="font:16px system-ui;background:#f5f7fa;color:#182638;padding:32px"><h1>Volvamos a conectar</h1><p>No pudimos comunicarnos con el negocio. Revisa la conexión y abre la aplicación de nuevo.</p><p>Los cambios sin confirmar no se han guardado.</p><button onclick="location.reload()" style="padding:12px 20px;border:0;border-radius:12px;background:#f97316;color:#182638">Reintentar</button></body></html>`, { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } })));
});
