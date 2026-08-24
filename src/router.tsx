import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const basepath =
    typeof process !== "undefined" && process.env?.VITE_BASE_PATH
      ? process.env.VITE_BASE_PATH
      : typeof import.meta !== "undefined" && import.meta.env?.VITE_BASE_PATH
        ? import.meta.env.VITE_BASE_PATH
        : undefined;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    basepath: basepath && basepath !== "./" ? basepath : undefined,
  });

  return router;
};
