import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/App";
import { loadConfig } from "@/lib/config";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Six upstreams means something is usually stale rather than broken.
      // Widgets keep showing the last good reading and say how old it is.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// The service worker only shows Notifications (ADR 0007); it caches nothing.
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");

// Which modules are on decides the nav and the routes, so it is known first.
void loadConfig().then(() =>
  createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
  ),
);
