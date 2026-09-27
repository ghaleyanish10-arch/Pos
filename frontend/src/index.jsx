import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./App";

import { initOfflineSync, replay } from "./utils/offlineQueue";
import { api } from "./api/client";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<App />);
}

// Offline-first bootstrap: drain the IndexedDB write queue on connectivity,
// and register the app-shell service worker so the register/order screens
// survive a network drop. Both are fire-and-forget — never block first paint.
initOfflineSync((endpoint, opts) => api(endpoint, opts).then(
  (data) => ({ ok: true, status: 200, data }),
  (err) => ({ ok: false, status: err?.status || 0, error: err })
));
replay((endpoint, opts) => api(endpoint, opts).then(
  (data) => ({ ok: true, status: 200, data }),
  (err) => ({ ok: false, status: err?.status || 0, error: err })
));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW is an enhancement; registration failures are non-fatal */
    });
  });
}
