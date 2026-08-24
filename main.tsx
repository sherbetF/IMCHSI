import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./styles.css";

function showStartupError(error: unknown) {
  console.error("IMCHSI startup error:", error);

  const rootElement = document.getElementById("root");
  if (!rootElement) return;

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#fff;color:#111827;box-sizing:border-box">
      <div style="max-width:720px;width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.06)">
        <h1 style="margin:0 0 12px;font-size:22px">Hospital Hub could not start</h1>
        <p style="margin:0 0 16px;color:#4b5563">The browser encountered a startup error. Please copy the message below.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#f3f4f6;padding:14px;border-radius:8px;font-size:13px">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280">URL: ${window.location.href}</p>
      </div>
    </div>`;
}

async function bootstrap() {
  try {
    const { getRouter } = await import("./router");
    const router = getRouter();

    const rootElement = document.getElementById("root");
    if (!rootElement) {
      throw new Error('Missing <div id="root"></div> in index.html');
    }

    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  } catch (error) {
    showStartupError(error);
  }
}

void bootstrap();
