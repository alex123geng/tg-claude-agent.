import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { getToken } from "../api/client";
import { useAuth } from "../context/AuthContext";

// Redirects to /login only when there's no token at all. If a token exists but
// /me failed because the backend is unreachable, we still render the page —
// individual pages show a network-error message instead of bouncing the user
// back to /login in a loop.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">Загрузка...</div>
    );
  }

  return <>{children}</>;
}
