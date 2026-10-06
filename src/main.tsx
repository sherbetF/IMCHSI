import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";
import MaintenancePage from "./components/MaintenancePage";

const router = getRouter();
const IS_MAINTENANCE = true; // Toggle this to false to disable maintenance mode

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
      {IS_MAINTENANCE ? <MaintenancePage /> : <RouterProvider router={router} />}
    </React.StrictMode>,
  );
}
