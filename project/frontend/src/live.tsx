import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

import { BACKEND_URL, getToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { queryClient } from "@/src/query-client";
import { useToast } from "@/src/ui";

/** Keeps one WebSocket open per logged-in staff session and refreshes order lists in real-time. */
export function LiveBridge() {
  const { me } = useAuth();
  const toast = useToast();
  const role = me?.user.role;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!role || role === "founder") return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: any;
    let ping: any;
    const connect = () => {
      const token = getToken();
      if (!token) return;
      ws = new WebSocket(`${BACKEND_URL.replace(/^http/, "ws")}/api/ws?token=${token}`);
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          const ev = JSON.parse(e.data);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          if (ev.type === "order_new") {
            const o = ev.order;
            if (role === "dapur" && o.status === "baru") toastRef.current(`Pesanan baru ${o.number} · ${o.table_name}`, "info");
            if ((role === "kasir" || role === "admin") && o.source === "meja") toastRef.current(`Pesanan baru dari ${o.table_name}!`, "info");
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else if (ev.type === "order_update" && role === "dapur" && ev.order.status === "baru") {
            toastRef.current(`Pesanan ${ev.order.number} masuk dapur`, "info");
          }
        } catch {}
      };
      ws.onopen = () => {
        ping = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
    };
  }, [role]);
  return null;
}
