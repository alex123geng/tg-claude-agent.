import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError, clearToken, getToken, setToken } from "../api/client";
import type { AuthResponse, Client } from "../types";

interface AuthContextValue {
  client: Client | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => void;
  refreshClient: () => Promise<void>;
  updateClientLocally: (client: Client) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshClient = useCallback(async () => {
    if (!getToken()) {
      setClient(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<Client>("/me");
      setClient(me);
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        clearToken();
        setClient(null);
      }
      // network/server errors: keep whatever client state we had, don't force logout
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshClient();
  }, [refreshClient]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>("/auth/login", { email, password }, false);
    setToken(data.access_token);
    setClient(data.client);
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, phone?: string) => {
      const data = await api.post<AuthResponse>(
        "/auth/register",
        { name, email, password, phone: phone || undefined },
        false,
      );
      setToken(data.access_token);
      setClient(data.client);
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setClient(null);
  }, []);

  const updateClientLocally = useCallback((updated: Client) => {
    setClient(updated);
  }, []);

  return (
    <AuthContext.Provider
      value={{ client, loading, login, register, logout, refreshClient, updateClientLocally }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
