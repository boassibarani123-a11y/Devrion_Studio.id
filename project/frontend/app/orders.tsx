import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";

import { api, fileUrl, rp } from "@/src/api";
import { METHOD, Order, PAY_STATUS, STATUS, timeAgo } from "@/src/orders";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Badge, Chip, ChipRow, Empty, GhostButton, GradientButton, Ionicons, Loading, PressScale, Sheet, useToast, useWide } from "@/src/ui";

const TABS = [
  { k: "masuk", label: "Masuk", icon: "notifications" },
  { k: "proses", label: "Diproses", icon: "flame" },
  { k: "bayar", label: "Belum Bayar", icon: "wallet" },
  { k: "riwayat", label: "Hari Ini", icon: "time" },
] as const;

export default function Orders() {
  const toast = useToast();
  const wide = useWide();
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("masuk");
  const [payFor, setPayFor] = useState<Order | null>(null);

  const active = useQuery({ queryKey: ["orders", "active"], queryFn: () => api<Order[]>("/orders?scope=active"), refetchInterval: 10000 });
  const today = useQuery({ queryKey: ["orders", "today"], queryFn: () => api<Order[]>("/orders?scope=today&limit=200"), enabled: tab === "riwayat" });

  const data = useMemo(() => {
    const a = active.data ?? [];
    if (tab === "masuk") return a.filter((o) => o.status === "pending");
    if (tab === "proses") return a.filter((o) => ["baru", "dimasak", "siap"].includes(o.status));
    if (tab === "bayar") return a.filter((o) => o.payment_status !== "paid" && o.status !== "batal");
    return today.data ?? [];
  }, [active.data, today.data, tab]);
  const counts = useMemo(() => {
    const a = active.data ?? [];
    return {
      masuk: a.filter((o) => o.status === "pending").length,
      proses: a.filter((o) => ["baru", "dimasak", "siap"].includes(o.status)).length,
      bayar: a.filter((o) => o.payment_status !== "paid" && o.status !== "batal").length,
      riwayat: 0,
    };
  }, [active.data]);

  const status = useMutation({
    mutationFn: ({ id, st }: { id: string; st: string }) => api(`/orders/${id}/status`, { method: "PATCH", body: { status: st } }),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast(v.st === "baru" ? "Pesanan dikirim ke dapur" : v.st === "batal" ? "Pesanan dibatalkan" : "Status diperbarui");
    },
    onError: (e: any) => toast(e.message, "err"),
  });

  return (
    <Shell title="Pesanan" subtitle="Pesanan masuk real-time dari meja" roles={["admin", "kasir"]}>
      <View style={{ paddingHorizontal: space.lg }}>
        <ChipRow>
          {TABS.map((t) => (
            <Chip
              key={t.k}
              testID={`orders-tab-${t.k}`}
              icon={t.icon as any}
              label={counts[t.k] ? `${t.label} · ${counts[t.k]}` : t.label}
              active={tab === t.k}
              onPress={() => setTab(t.k)}
            />
          ))}
        </ChipRow>
      </View>
      {active.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          key={wide ? "w" : "n"}
          data={data}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: space.md } : undefined}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: space.xl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={active.isRefetching} onRefresh={() => { active.refetch(); }} />}
          ListEmptyComponent={<Empty icon="receipt-outline" title="Belum ada pesanan" subtitle="Pesanan dari meja (NFC/QR) akan muncul otomatis di sini" />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(320)} layout={LinearTransition} style={{ flex: 1 }}>
              <OrderCard
                o={item}
                onSend={() => status.mutate({ id: item.id, st: "baru" })}
                onReject={() => status.mutate({ id: item.id, st: "batal" })}
                onServe={() => status.mutate({ id: item.id, st: "disajikan" })}
                onPay={() => setPayFor(item)}
              />
            </Animated.View>
          )}
        />
      )}
      <PaySheet order={payFor} onClose={() => setPayFor(null)} />
    </Shell>
  );
}

function OrderCard({ o, onSend, onReject, onServe, onPay }: { o: Order; onSend: () => void; onReject: () => void; onServe: () => void; onPay: () => void }) {
  const st = STATUS[o.status];
  const ps = PAY_STATUS[o.payment_status];
  return (
    <View style={[s.card, o.status === "pending" && s.cardNew]} testID={`order-card-${o.id}`}>
      <View style={s.head}>
        <View style={s.tableIcon}>
          <Ionicons name={o.source === "meja" ? "wifi" : "calculator"} size={18} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.table}>{o.table_name}</Text>
          <Text style={s.meta}>
            {o.number} · {o.customer_name} · {timeAgo(o.created_at)}
          </Text>
        </View>
        <Badge label={st.label} color={st.color} testID={`order-status-${o.id}`} />
      </View>
      <View style={s.items}>
        {o.items.map((i) => (
          <View key={i.menu_id} style={s.itemRow}>
            <Text style={s.itemText} numberOfLines={1}>
              <Text style={{ color: colors.brandSecondary, fontWeight: "800" }}>{i.qty}x </Text>
              {i.name}
            </Text>
            <Text style={s.itemPrice}>{rp(i.subtotal)}</Text>
          </View>
        ))}
        {o.note ? <Text style={s.note}>Catatan: {o.note}</Text> : null}
      </View>
      <View style={s.foot}>
        <View style={{ flex: 1 }}>
          <Text style={s.total}>{rp(o.total)}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <Badge label={ps.label} color={ps.color} testID={`order-pay-status-${o.id}`} />
            <Badge label={METHOD[o.payment_method] ?? o.payment_method} color={colors.muted} />
          </View>
        </View>
      </View>
      <View style={s.actions}>
        {o.status === "pending" && (
          <>
            <GhostButton testID={`order-reject-${o.id}`} title="Tolak" icon="close" danger small onPress={onReject} />
            <GradientButton testID={`order-send-kitchen-${o.id}`} title="Kirim ke Dapur" icon="flame" small onPress={onSend} style={{ flex: 1 }} />
          </>
        )}
        {o.status === "siap" && <GradientButton testID={`order-serve-${o.id}`} title="Sajikan" icon="restaurant" small onPress={onServe} style={{ flex: 1 }} />}
      </View>
      <View style={s.actions}>
        {o.payment_status !== "paid" && o.status !== "batal" && (
          <GhostButton testID={`order-pay-${o.id}`} title={o.payment_status === "verifying" ? "Cek Bukti" : "Terima Bayar"} icon="wallet" small onPress={onPay} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

function PaySheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState("cash");
  const pay = useMutation({
    mutationFn: () => api(`/orders/${order!.id}/payment`, { method: "PATCH", body: { method: order!.proof_path ? order!.payment_method : method, paid: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast("Pembayaran dikonfirmasi");
      onClose();
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  return (
    <Sheet visible={!!order} onClose={onClose} title={order ? `Pembayaran ${order.number}` : ""} testID="pay-sheet">
      {order && (
        <View style={{ gap: space.md }}>
          <Text style={s.payTotal}>{rp(order.total)}</Text>
          {order.bank ? (
            <Text style={s.meta}>
              Transfer ke {order.bank.bank} {order.bank.number} a.n {order.bank.holder}
            </Text>
          ) : null}
          {order.proof_path ? (
            <View>
              <Text style={[s.meta, { marginBottom: space.sm }]}>Bukti pembayaran dari pelanggan:</Text>
              <Image
                testID="pay-proof-image"
                source={{ uri: fileUrl(order.proof_path, true) }}
                style={{ width: "100%", height: 320, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }}
                contentFit="contain"
              />
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              {["cash", "qris", "bank"].map((m) => (
                <PressScale key={m} testID={`pay-method-${m}`} onPress={() => setMethod(m)} style={[s.pm, method === m && s.pmOn]}>
                  <Text style={[s.pmText, method === m && { color: colors.onSurface }]}>{METHOD[m]}</Text>
                </PressScale>
              ))}
            </View>
          )}
          <GradientButton testID="pay-confirm-button" title="Konfirmasi Lunas" icon="checkmark-circle" loading={pay.isPending} onPress={() => pay.mutate()} />
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg, gap: space.md },
  cardNew: { borderColor: colors.brandPrimary, shadowColor: colors.brandPrimary, shadowOpacity: 0.35, shadowRadius: 18, elevation: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  tableIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  table: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "700", fontSize: 17 },
  meta: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  items: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: space.md, gap: 6 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  itemText: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.text, flex: 1 },
  itemPrice: { color: colors.onSurfaceTertiary, fontSize: 13, fontFamily: fonts.text },
  note: { color: colors.warning, fontSize: 12, fontFamily: fonts.text, marginTop: 4 },
  foot: { flexDirection: "row", alignItems: "center" },
  total: { color: colors.onSurface, fontSize: 20, fontWeight: "800", fontFamily: fonts.display },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  payTotal: { color: colors.onSurface, fontSize: 32, fontWeight: "800", fontFamily: fonts.display },
  pm: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent", minWidth: 90 },
  pmOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  pmText: { color: colors.muted, fontWeight: "700", fontFamily: fonts.text },
});
