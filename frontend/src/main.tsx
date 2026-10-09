import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";

import App from "./App";
import ToastViewport from "./components/ui/ToastViewport";
import AppDialogProvider from "./components/ui/AppDialogProvider";
import { notify } from "./components/ui/toast";
import "./index.css";
import "./styles/design.css";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => notify("Action completed successfully."),
    onError: (error) => {
      const responseMessage: unknown = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
      const message = axios.isAxiosError(error) && error.response && error.response.status < 500 && typeof responseMessage === "string"
        ? responseMessage : "The action could not be completed. Please try again.";
      notify(message, "error");
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <QueryClientProvider client={queryClient}>
        <AppDialogProvider>
          <App />
          <ToastViewport />
        </AppDialogProvider>
      </QueryClientProvider>
    </HashRouter>
  </StrictMode>,
);
