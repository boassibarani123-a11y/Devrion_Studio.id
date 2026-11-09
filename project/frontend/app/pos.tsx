import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, menuImage, rp } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Order, ReceiptModal } from "@/src/orders";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Chip, ChipRow, Empty, Field, GradientButton, Ionicons, Loading, PressScale, Sheet, useToast, useWide } from "@/src/ui";

type Menu = { id: string; name: string; price: number; category_id: string; image_path?: string; image_url?: string; available: boolean; badge?: string };
type Cat = { id: string; name: string };
type Table = { id: string; name: string };

const PAYS = [
  { k: "cash", label: "Tunai", icon: "cash" },
  { k: "qris", label: "QRIS", icon: "qr-code" },
  { k: "bank", label: "Transfer", icon: "card" },
  { k: "kasir", label: "Bayar Nanti", icon: "time" },
] as const;

export default function POS() {
  const { me } = useAuth();
  const wide = useWide();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [table, setTable] = useState("Take Away");
  const [cust, setCust] = useState("");
  const [pay, setPay] = useState<(typeof PAYS)[number]["k"]>("cash");
  const [sheet, setSheet] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);

  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<Menu[]>("/menu") });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Cat[]>("/categories") });
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => api<Table[]>("/tables") });

  const list = useMemo(
    () => (menu.data ?? []).filter((m) => m.available && (cat === "all" || m.category_id === cat) && m.name.toLowerCase().includes(q.toLowerCase())),
    [menu.data, cat, q],
  );
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ m: menu.data?.find((x) => x.id === id), qty }))
    .filter((l) => l.m) as { m: Menu; qty: number }[];
  const total = lines.reduce((a, l) => a + l.m.price * l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  const change = (id: string, d: number) =>
    setCart((c) => {
      const n = { ...c, [id]: Math.max(0, (c[id] ?? 0) + d) };
      if (!n[id]) delete n[id];
      return n;
    });

  const submit = useMutation({
    mutationFn: () =>
      api<Order>("/orders", {
        method: "POST",
        body: { items: lines.map((l) => ({ menu_id: l.m.id, qty: l.qty })), table_name: table, customer_name: cust, payment_method: pay, paid: pay !== "kasir" },
      }),
    onSuccess: (o) => {
      setCart({});
      setCust("");
      setSheet(false);
      setReceipt(o);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: any) => toast(e.message, "err"),
  });

  const cols = wide ? 3 : 2;

  const CartBody = (
    <View style={{ gap: space.md }}>
      {lines.length === 0 ? (
        <Empty icon="cart-outline" title="Keranjang kosong" subtitle="Tap menu untuk menambahkan" />
      ) : (
        lines.map((l) => (
          <Animated.View key={l.m.id} entering={FadeInDown} layout={LinearTransition} style={s.line}>
            <Image source={{ uri: menuImage(l.m) }} style={s.lineImg} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={s.lineName} numberOfLines={1}>{l.m.name}</Text>
              <Text style={s.linePrice}>{rp(l.m.price * l.qty)}</Text>
            </View>
            <View style={s.qty}>
              <PressScale testID={`pos-cart-minus-${l.m.id}`} onPress={() => change(l.m.id, -1)} style={s.qBtn}>
                <Ionicons name="remove" size={16} color={colors.onSurface} />
              </PressScale>
              <Text style={s.qText}>{l.qty}</Text>
              <PressScale testID={`pos-cart-plus-${l.m.id}`} onPress={() => change(l.m.id, 1)} style={s.qBtn}>
                <Ionicons name="add" size={16} color={colors.onSurface} />
              </PressScale>
            </View>
          </Animated.View>
        ))
      )}
      <Text style={s.label}>Meja</Text>
      <ChipRow>
        {["Take Away", ...(tables.data ?? []).map((t) => t.name)].map((t) => (
          <Chip key={t} testID={`pos-table-${t.replace(/\s/g, "-").toLowerCase()}`} label={t} active={table === t} onPress={() => setTable(t)} />
        ))}
      </ChipRow>
      <Field testID="pos-customer-input" label="Nama pelanggan" placeholder="Opsional" value={cust} onChangeText={setCust} icon="person-outline" />
      <Text style={s.label}>Pembayaran</Text>
      <View style={s.payGrid}>
        {PAYS.map((p) => (
          <PressScale key={p.k} testID={`pos-pay-${p.k}`} onPress={() => setPay(p.k)} style={[s.pay, pay === p.k && s.payOn]}>
            <Ionicons name={p.icon as any} size={18} color={pay === p.k ? colors.brandPrimary : colors.muted} />
            <Text style={[s.payText, pay === p.k && { color: colors.onSurface }]}>{p.label}</Text>
          </PressScale>
        ))}
      </View>
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Total</Text>
        <Text style={s.total} testID="pos-total">{rp(total)}</Text>
      </View>
      <GradientButton testID="pos-submit-button" title="Kirim ke Dapur" icon="flame" disabled={!lines.length} loading={submit.isPending} onPress={() => submit.mutate()} />
    </View>
  );

  return (
    <Shell title="Kasir / POS" subtitle="Catat pesanan langsung" roles={["admin", "kasir"]}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: space.lg }}>
            <Field testID="pos-search-input" icon="search" placeholder="Cari menu…" value={q} onChangeText={setQ} style={{ marginBottom: 0 }} />
            <ChipRow>
              <Chip testID="pos-cat-all" label="Semua" active={cat === "all"} onPress={() => setCat("all")} />
              {(cats.data ?? []).map((c) => (
                <Chip key={c.id} testID={`pos-cat-${c.id}`} label={c.name} active={cat === c.id} onPress={() => setCat(c.id)} />
              ))}
            </ChipRow>
          </View>
          {menu.isLoading ? (
            <Loading />
          ) : (
            <FlatList
              key={cols}
              data={list}
              numColumns={cols}
              keyExtractor={(m) => m.id}
              columnWrapperStyle={{ gap: space.md }}
              contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: wide ? space.xl : 96 }}
              ListEmptyComponent={<Empty icon="fast-food-outline" title="Menu tidak ditemukan" />}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40)} style={{ flex: 1 / cols }}>
                  <PressScale testID={`pos-menu-${item.id}`} onPress={() => change(item.id, 1)} style={s.card}>
                    <Image source={{ uri: menuImage(item) }} style={s.cardImg} contentFit="cover" transition={300} />
                    {cart[item.id] ? (
                      <Animated.View entering={FadeInDown} style={s.cartBadge}>
                        <Text style={s.cartBadgeText}>{cart[item.id]}</Text>
                      </Animated.View>
                    ) : null}
                    <View style={{ padding: space.md }}>
                      <Text style={s.cardName} numberOfLines={2}>{item.name}</Text>
                      <View style={s.cardRow}>
                        <Text style={s.cardPrice}>{rp(item.price)}</Text>
                        <View style={s.plus}>
                          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
                        </View>
                      </View>
                    </View>
                  </PressScale>
                </Animated.View>
              )}
            />
          )}
        </View>
        {wide && (
          <View style={s.side}>
            <Text style={s.sideTitle}>Pesanan Saat Ini</Text>
            <Animated.ScrollView contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
              {CartBody}
            </Animated.ScrollView>
          </View>
        )}
      </View>
      {!wide && count > 0 && (
        <Animated.View entering={SlideInDown.duration(320)} exiting={SlideOutDown} style={[s.floatBar, { bottom: space.lg }]}>
          <View>
            <Text style={s.floatCount}>{count} item</Text>
            <Text style={s.floatTotal}>{rp(total)}</Text>
          </View>
          <GradientButton testID="pos-open-cart" title="Lihat Pesanan" icon="cart" onPress={() => setSheet(true)} small />
        </Animated.View>
      )}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Pesanan Saat Ini" testID="pos-cart-sheet">
        {CartBody}
        <View style={{ height: insets.bottom }} />
      </Sheet>
      <ReceiptModal order={receipt} restoName={me?.restaurant?.name ?? ""} onClose={() => setReceipt(null)} />
    </Shell>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, overflow: "hidden" },
  cardImg: { width: "100%", aspectRatio: 1.2, backgroundColor: colors.surfaceTertiary },
  cardName: { color: colors.onSurface, fontFamily: fonts.text, fontWeight: "700", fontSize: 14, minHeight: 36 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
  cardPrice: { color: colors.brandSecondary, fontWeight: "800", fontSize: 14, fontFamily: fonts.text },
  plus: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: space.sm, right: space.sm, minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cartBadgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  side: { width: 380, borderLeftWidth: 1, borderLeftColor: colors.glassBorder, backgroundColor: colors.glass, padding: space.lg },
  sideTitle: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 18, fontWeight: "700", marginBottom: space.md },
  line: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: space.sm },
  lineImg: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  lineName: { color: colors.onSurface, fontWeight: "600", fontSize: 14, fontFamily: fonts.text },
  linePrice: { color: colors.brandSecondary, fontSize: 13, marginTop: 2, fontFamily: fonts.text },
  qty: { flexDirection: "row", alignItems: "center", gap: space.sm },
  qBtn: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  qText: { color: colors.onSurface, fontWeight: "800", minWidth: 18, textAlign: "center" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", fontFamily: fonts.text, marginBottom: -space.sm },
  payGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pay: { flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: space.sm, height: 46, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1.5, borderColor: "transparent" },
  payOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  payText: { color: colors.muted, fontWeight: "600", fontSize: 13, fontFamily: fonts.text },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.sm },
  totalLabel: { color: colors.muted, fontSize: 14, fontFamily: fonts.text },
  total: { color: colors.onSurface, fontSize: 24, fontWeight: "800", fontFamily: fonts.display },
  floatBar: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: space.md,
    paddingLeft: space.lg,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  floatCount: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  floatTotal: { color: colors.onSurface, fontSize: 18, fontWeight: "800", fontFamily: fonts.display },
});
