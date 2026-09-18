import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "./StaffAuthContext";
import type { StaffRole } from "../../lib/types";

export function StaffProtectedRoute() {
  const { user, token, loading } = useStaffAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FAFAFA] p-6">
        <PageSkeleton />
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function RoleRoute({ roles }: { roles: StaffRole[] }) {
  const { user } = useStaffAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === "technician" ? "/app/my-jobs" : "/app"} replace />;
  }
  return <Outlet />;
}
