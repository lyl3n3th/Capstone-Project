import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import ConnectionLoadingState from "../common/ConnectionLoadingState";

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
    return <ConnectionLoadingState message="Checking your sign-in session..." />;
  }

  if (currentUser && !allowAuthenticated) {
    return (
      <Navigate to={getDefaultRouteForRole(currentUser.role)} replace />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
