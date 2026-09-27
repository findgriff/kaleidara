import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.js";

/**
 * Widget entry point. The build script injects a `<div id="agent-os-studio-root">`
 * and this bundle; the host loads the resulting single HTML file inside the
 * Apps SDK iframe.
 */
const container = document.getElementById("agent-os-studio-root");

if (!container) {
  throw new Error("Widget root element #agent-os-studio-root is missing from the widget HTML.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
