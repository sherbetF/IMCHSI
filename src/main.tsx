import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

function showFatalError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  root.innerHTML = `
    <div style="font-family:system-ui,sans-serif;padding:24px;max-width:900px;margin:40px auto;line-height:1.5">
      <h1 style="font-size:24px;margin-bottom:12px">Hospital Hub could not start</h1>
      <p style="margin-bottom:12px">A browser startup error occurred. Please copy the message below.</p>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#f4f4f5;padding:16px;border-radius:8px;border:1px solid #ddd">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
    </div>`;
}

window.addEventListener("error", (event) => {
  if (event.error) showFatalError(event.error);
});
window.addEventListener("unhandledrejection", (event) => {
  showFatalError(event.reason);
});

try {
  const router = getRouter();

  declare module "@tanstack/react-router" {
    interface Register {
      router: typeof router;
    }
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error('Missing <div id="root"></div>');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
} catch (error) {
  console.error(error);
  showFatalError(error);
}
