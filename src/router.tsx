import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  let basepath: string | undefined = undefined;

  const envBase =
    typeof process !== "undefined" && process.env?.VITE_BASE_PATH
      ? process.env.VITE_BASE_PATH
      : typeof import.meta !== "undefined" && import.meta.env?.VITE_BASE_PATH
        ? import.meta.env.VITE_BASE_PATH
        : undefined;

  if (envBase && envBase !== "./" && envBase !== "/") {
    basepath = envBase;
  } else if (typeof window !== "undefined") {
    const isGitHubIo = window.location.hostname.endsWith(".github.io");
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (isGitHubIo && segments.length > 0) {
      basepath = `/${segments[0]}`;
    }
  }

  // Normalize basepath (remove trailing slash if present)
  if (basepath && basepath.length > 1 && basepath.endsWith("/")) {
    basepath = basepath.slice(0, -1);
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    basepath: basepath || undefined,
  });

  return router;
};
