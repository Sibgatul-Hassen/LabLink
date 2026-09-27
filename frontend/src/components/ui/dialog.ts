import { createContext, useContext } from "react";

export type AppDialog = {
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, options?: { required?: boolean }) => Promise<string | null>;
};

export const AppDialogContext = createContext<AppDialog | null>(null);

export function useAppDialog(): AppDialog {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("AppDialogProvider is missing");
  return context;
}
