import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

interface PublicOnlyRouteProps {
  children?: ReactNode;
  allowAuthenticated?: boolean;
}

export default function PublicOnlyRoute({
  children,
  allowAuthenticated = false,
}: PublicOnlyRouteProps) {
  const { currentUser, isReady, getDefaultRouteForRole } = useAuth();

  if (!isReady) {
    return null;
  }

  if (currentUser && !allowAuthenticated) {
    return (
      <Navigate to={getDefaultRouteForRole(currentUser.role)} replace />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
