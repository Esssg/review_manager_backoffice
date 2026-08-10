import { createContext, useContext } from "react";

export const AdminAccessContext = createContext(null);

export function useAdminAccessContext() {
  return useContext(AdminAccessContext);
}
