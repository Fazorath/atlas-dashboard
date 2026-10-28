/* Atlas's service worker. It does one job: Notifications (ADR 0007). It shows
   what the API pushes and opens Atlas on the Alert's Area when tapped. It
   caches nothing and handles no fetches, so the app loads exactly as it would
   without it. */

self.addEventListener("install", () => self.skipWaiting());
// Take over open pages now, so a tap can steer the page that is already open.
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Atlas", {
      body: data.body || "",
      tag: data.tag,
      // A newer one of the same Alert replaces the old, but still buzzes.
      renotify: Boolean(data.tag),
      icon: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (!("focus" in client)) continue;
        await client.focus();
        try {
          await client.navigate(url);
        } catch {
          /* not ours to steer; it is focused, which is close enough */
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
