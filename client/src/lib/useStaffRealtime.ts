import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { useStaffAuth } from "../features/auth/StaffAuthContext";

export function useStaffRealtime() {
  const { token } = useStaffAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io({
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const refreshBoard = () => {
      void queryClient.invalidateQueries({ queryKey: ["staff", "requests"] });
      void queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
      void queryClient.invalidateQueries({ queryKey: ["staff", "my-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["staff", "reports"] });
    };

    socket.on("request:created", refreshBoard);
    socket.on("request:updated", refreshBoard);
    socket.io.on("reconnect", refreshBoard);
    socket.on("technician:updated", () => {
      void queryClient.invalidateQueries({ queryKey: ["staff", "technicians"] });
      void queryClient.invalidateQueries({ queryKey: ["staff", "me"] });
    });

    return () => {
      socket.off("request:created", refreshBoard);
      socket.off("request:updated", refreshBoard);
      socket.io.off("reconnect", refreshBoard);
      socket.disconnect();
    };
  }, [queryClient, token]);
}
