import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { rp } from "@/src/api";
import { colors, fonts, radius, space } from "@/src/theme";
import { GradientButton, Ionicons } from "@/src/ui";

export type OrderItem = { menu_id: string; name: string; price: number; qty: number; note?: string; subtotal: number };
export type Order = {
  id: string;
  number: string;
  table_name: string;
  customer_name: string;
  note?: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "baru" | "dimasak" | "siap" | "disajikan" | "batal";
  payment_status: "unpaid" | "verifying" | "paid";
  payment_method: string;
  bank?: { bank: string; number: string; holder: string } | null;
  proof_path?: string | null;
  source: "meja" | "kasir";
  created_at: string;
  outlet_id: string;
};

export const STATUS: Record<Order["status"], { label: string; color: string; icon: any }> = {
  pending: { label: "Menunggu Kasir", color: colors.warning, icon: "hourglass" },
  baru: { label: "Baru", color: colors.info, icon: "sparkles" },
  dimasak: { label: "Dimasak", color: colors.brandPrimary, icon: "flame" },
  siap: { label: "Siap", color: colors.success, icon: "checkmark-done" },
  disajikan: { label: "Disajikan", color: colors.muted, icon: "restaurant" },
  batal: { label: "Batal", color: colors.error, icon: "close-circle" },
};

export const PAY_STATUS: Record<Order["payment_status"], { label: string; color: string }> = {
  unpaid: { label: "Belum Bayar", color: colors.error },
  verifying: { label: "Cek Bukti", color: colors.warning },
  paid: { label: "Lunas", color: colors.success },
};

export const METHOD: Record<string, string> = { cash: "Tunai", qris: "QRIS", bank: "Transfer", kasir: "Bayar di Kasir" };

export const timeAgo = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
};

/** Animated success + receipt popup used after POS checkout. */
export function ReceiptModal({ order, restoName, onClose }: { order: Order | null; restoName: string; onClose: () => void }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (order) pulse.value = withDelay(500, withRepeat(withTiming(1, { duration: 1400 }), -1, false));
    else pulse.value = 0;
  }, [order, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: (1 - pulse.value) * 0.6, transform: [{ scale: 1 + pulse.value * 0.35 }] }));
  return (
    <Modal visible={!!order} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {order ? (
        <Animated.View entering={FadeIn} style={s.wrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={s.center}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <Animated.View style={[s.ring, ring]} />
              <Animated.View entering={ZoomIn.duration(350)}>
                <LinearGradient colors={[colors.brandPrimary, colors.brandDeep]} style={s.check}>
                  <Ionicons name="checkmark" size={48} color={colors.onBrandPrimary} />
                </LinearGradient>
              </Animated.View>
            </View>
            <Animated.Text entering={FadeInDown.delay(250)} style={s.title}>
              Pesanan Terkirim!
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(320)} style={s.sub}>
              Pesanan {order.number} diteruskan ke dapur
            </Animated.Text>
            <Animated.View entering={FadeInDown.delay(450).duration(320)} style={s.receipt} testID="pos-receipt">
              <Text style={s.rHead}>{restoName}</Text>
              <Text style={s.rSmall}>
                {order.number} · {new Date(order.created_at).toLocaleString("id-ID")}
              </Text>
              <Text style={s.rSmall}>
                {order.table_name} · {order.customer_name}
              </Text>
              <View style={s.dash} />
              {order.items.map((i) => (
                <View key={i.menu_id} style={s.rRow}>
                  <Text style={s.rText} numberOfLines={1}>
                    {i.qty}x {i.name}
                  </Text>
                  <Text style={s.rText}>{rp(i.subtotal)}</Text>
                </View>
              ))}
              <View style={s.dash} />
              <View style={s.rRow}>
                <Text style={[s.rText, { fontWeight: "800" }]}>TOTAL</Text>
                <Text style={[s.rText, { fontWeight: "800" }]}>{rp(order.total)}</Text>
              </View>
              <Text style={s.rPay}>
                {order.payment_status === "paid" ? `LUNAS · ${METHOD[order.payment_method] ?? ""}` : "BELUM DIBAYAR"}
              </Text>
            </Animated.View>
            <GradientButton testID="pos-receipt-close" title="Pesanan Baru" icon="add" onPress={onClose} style={{ marginTop: space.xl, alignSelf: "stretch" }} />
          </View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: space.xl },
  center: { width: "100%", maxWidth: 380, alignItems: "center" },
  ring: { position: "absolute", width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: colors.brandPrimary },
  check: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 26, fontWeight: "800", marginTop: space.xl },
  sub: { color: colors.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 4 },
  receipt: { width: "100%", backgroundColor: colors.receipt, borderRadius: radius.lg, padding: space.lg, marginTop: space.xl },
  rHead: { color: colors.onReceipt, fontWeight: "800", fontSize: 16, textAlign: "center", fontFamily: fonts.display },
  rSmall: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 2, fontFamily: fonts.text },
  dash: { borderBottomWidth: 1.5, borderStyle: "dashed", borderColor: colors.muted, marginVertical: space.md },
  rRow: { flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 2 },
  rText: { color: colors.onReceipt, fontSize: 13, fontFamily: fonts.text, flexShrink: 1 },
  rPay: { marginTop: space.md, textAlign: "center", color: colors.brandDeep, fontWeight: "800", fontSize: 12, fontFamily: fonts.text },
});
