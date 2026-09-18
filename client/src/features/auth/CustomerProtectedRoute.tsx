import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useCustomerAuth } from "./CustomerAuthContext";

export function CustomerProtectedRoute() {
  const { user, token, loading } = useCustomerAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FAFAFA] p-6">
        <PageSkeleton />
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
