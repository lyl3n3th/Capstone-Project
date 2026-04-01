import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  getLoginRouteForRoles,
  type AppRole,
} from "../../types/user";

interface ProtectedRouteProps {
  allowedRoles: AppRole[];
  children?: ReactNode;
  loginPath?: string;
}

export default function ProtectedRoute({
  allowedRoles,
  children,
  loginPath,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { currentUser, isReady, getDefaultRouteForRole } = useAuth();

  if (!isReady) {
    return null;
  }

  if (!currentUser) {
    return (
      <Navigate
        to={loginPath ?? getLoginRouteForRoles(allowedRoles)}
        replace
        state={{ from: location }}
      />
    );
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return (
      <Navigate to={getDefaultRouteForRole(currentUser.role)} replace />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
