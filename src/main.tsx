import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { IS_MAINTENANCE_MODE } from "./lib/firebase";
import { MaintenanceNoticeScreen } from "./components/hospital/MaintenanceNoticeScreen";
import "./styles.css";

const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      {IS_MAINTENANCE_MODE ? <MaintenanceNoticeScreen /> : <RouterProvider router={router} />}
    </React.StrictMode>,
  );
}
