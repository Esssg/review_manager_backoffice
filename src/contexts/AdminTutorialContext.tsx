import { createContext, useContext } from "react";

export const AdminTutorialContext = createContext({
  isRunning: false,
  phase: "idle",
  step: null,
  stepIndex: -1,
  isDemoMode: false
});

export function useAdminTutorialContext() {
  return useContext(AdminTutorialContext);
}
