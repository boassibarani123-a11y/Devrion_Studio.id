import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, loadToken, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";

export type Role = "founder" | "admin" | "kasir" | "dapur";
export type User = { id: string; name: string; email: string; role: Role; restaurant_id?: string; outlet_id?: string };
type Me = { user: User; restaurant: { id: string; name: string; logo_path?: string } | null; outlet: { id: string; name: string } | null };

type Ctx = {
  me: Me | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await setToken(null);
    setMe(null);
    queryClient.clear();
  }, []);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {}
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
      const t = await loadToken();
      if (t) {
        try {
          setMe(await api<Me>("/auth/me"));
        } catch {
          await setToken(null);
        }
      }
      setReady(true);
    })();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    await setToken(res.token);
    const m = await api<Me>("/auth/me");
    setMe(m);
    return res.user;
  }, []);

  return <AuthCtx.Provider value={{ me, ready, login, logout, refresh }}>{ready ? children : null}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const homeFor = (role: Role) =>
  ({ founder: "/founder", admin: "/dashboard", kasir: "/pos", dapur: "/kitchen" })[role] as any;
