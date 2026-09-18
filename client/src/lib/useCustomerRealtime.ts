import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { useCustomerAuth } from "../features/auth/CustomerAuthContext";

export function useCustomerRealtime() {
  const { token } = useCustomerAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io({
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["customer"] });
    };

    socket.on("request:created", refresh);
    socket.on("request:updated", refresh);
    socket.on("notification:created", refresh);

    return () => {
      socket.off("request:created", refresh);
      socket.off("request:updated", refresh);
      socket.off("notification:created", refresh);
      socket.disconnect();
    };
  }, [queryClient, token]);
}
