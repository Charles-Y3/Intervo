/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// The app's service worker: caches the app so it works offline (same as before),
// and shows workout reminders when the server sends a push, even with the app closed.
declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Open the app shell for page loads, but never for API calls.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// "Reload" in the update banner asks the waiting worker to take over.
self.addEventListener('message', (e) => {
  if ((e.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

/** Only same-site paths may be opened from a notification. */
function safePath(v: unknown): string {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

self.addEventListener('push', (e) => {
  let title = 'Time to train';
  let body = 'Open Intervo and start when you are ready.';
  let url = '/';
  try {
    const data = e.data?.json() as { title?: unknown; body?: unknown; url?: unknown } | undefined;
    if (typeof data?.title === 'string') title = data.title.slice(0, 80);
    if (typeof data?.body === 'string') body = data.body.slice(0, 200);
    url = safePath(data?.url);
  } catch {
    /* not JSON: keep the defaults */
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon192.png',
      badge: '/icons/icon192.png',
      tag: 'intervo-reminder', // a new reminder replaces an unread older one
      data: { url },
    }),
  );
});

// Tapping the notification focuses the app if it is open, otherwise opens it.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = safePath((e.notification.data as { url?: unknown } | undefined)?.url);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow(url);
    }),
  );
});
