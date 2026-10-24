// Service worker for incoming-call notifications.
// Lets the OS show a persistent notification with Accept/Decline buttons even
// when the Frequency tab is in the background (Chrome must be running).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // "accept" / "decline" come from the action buttons; "" = body click.
  const action = event.action || "open";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      let client = all.find((c) => c.url.includes(self.registration.scope)) || all[0];
      if (client) {
        await client.focus();
        client.postMessage({ type: "call-action", action });
      } else {
        await self.clients.openWindow(self.registration.scope);
      }
    })()
  );
});
