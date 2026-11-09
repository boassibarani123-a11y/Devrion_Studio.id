import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { api, rp } from "@/src/api";
import { useAuth } from "@/src/auth";
import { METHOD } from "@/src/orders";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Chip, ChipRow, Empty, FadeInItem, Glass, IconName, Ionicons, Loading, SectionTitle, useWide } from "@/src/ui";

type Report = {
  revenue: number;
  expense: number;
  profit: number;
  orders: number;
  all_orders: number;
  unpaid: number;
  avg_ticket: number;
  from_table: number;
  series: { date: string; revenue: number; expense: number; orders: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  methods: { method: string; amount: number }[];
  expense_categories: { category: string; amount: number }[];
};

const PERIODS = [
  { d: 1, label: "Hari Ini" },
  { d: 7, label: "7 Hari" },
  { d: 30, label: "30 Hari" },
  { d: 90, label: "90 Hari" },
];

export default function Dashboard() {
  const wide = useWide();
  const isAdmin = useAuth().me?.user.role === "admin";
  const [days, setDays] = useState(7);
  const [outlet, setOutlet] = useState<string | null>(null);
  const outlets = useQuery({ queryKey: ["outlets"], queryFn: () => api<{ id: string; name: string }[]>("/outlets"), enabled: isAdmin });
  const r = useQuery({
    queryKey: ["orders", "report", days, outlet],
    queryFn: () => api<Report>(`/reports/summary?days=${days}${outlet ? `&outlet_id=${outlet}` : ""}`),
    enabled: isAdmin,
  });
  const d = r.data;

  const kpis: { label: string; value: string; icon: IconName; color: string; hero?: boolean; id: string }[] = d
    ? [
        { id: "revenue", label: "Pendapatan", value: rp(d.revenue), icon: "trending-up", color: colors.success, hero: true },
        { id: "expense", label: "Pengeluaran", value: rp(d.expense), icon: "trending-down", color: colors.error },
        { id: "profit", label: "Laba Bersih", value: rp(d.profit), icon: "diamond", color: d.profit >= 0 ? colors.brandPrimary : colors.error },
        { id: "orders", label: "Pesanan Lunas", value: String(d.orders), icon: "receipt", color: colors.info },
        { id: "avg", label: "Rata-rata / Nota", value: rp(d.avg_ticket), icon: "pricetag", color: colors.brandSecondary },
        { id: "unpaid", label: "Belum Dibayar", value: rp(d.unpaid), icon: "hourglass", color: colors.warning },
      ]
    : [];
  const max = Math.max(1, ...(d?.series ?? []).map((x) => Math.max(x.revenue, x.expense)));
  const series = (d?.series ?? []).slice(-14);

  return (
    <Shell title="Dashboard" subtitle="Laporan pendapatan & pengeluaran" roles={["admin"]}>
      <View style={{ paddingHorizontal: space.lg }}>
        <ChipRow>
          {PERIODS.map((p) => (
            <Chip key={p.d} testID={`report-period-${p.d}`} label={p.label} active={days === p.d} onPress={() => setDays(p.d)} />
          ))}
          {(outlets.data?.length ?? 0) > 1 && (
            <>
              <View style={s.sep} />
              <Chip testID="report-outlet-all" label="Semua Outlet" active={!outlet} onPress={() => setOutlet(null)} />
              {outlets.data!.map((o) => (
                <Chip key={o.id} testID={`report-outlet-${o.id}`} label={o.name} active={outlet === o.id} onPress={() => setOutlet(o.id)} />
              ))}
            </>
          )}
        </ChipRow>
      </View>
      {r.isLoading || !d ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={r.isRefetching} onRefresh={() => { r.refetch(); }} />}
        >
          <View style={s.kpiGrid}>
            {kpis.map((k, i) => (
              <FadeInItem key={k.id} index={i} style={[s.kpiWrap, { flexBasis: wide ? "31%" : "46%" }]}>
                {k.hero ? (
                  <LinearGradient colors={[colors.brandPrimary, colors.brandDeep]} style={s.kpi}>
                    <Ionicons name={k.icon} size={20} color={colors.onBrandPrimary} />
                    <Text style={[s.kpiLabel, { color: colors.onBrandTertiary }]}>{k.label}</Text>
                    <Text style={[s.kpiValue, { color: colors.onBrandPrimary }]} numberOfLines={1} adjustsFontSizeToFit testID={`kpi-${k.id}`}>
                      {k.value}
                    </Text>
                  </LinearGradient>
                ) : (
                  <Glass style={s.kpi}>
                    <Ionicons name={k.icon} size={20} color={k.color} />
                    <Text style={s.kpiLabel}>{k.label}</Text>
                    <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit testID={`kpi-${k.id}`}>
                      {k.value}
                    </Text>
                  </Glass>
                )}
              </FadeInItem>
            ))}
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: space.lg }}>
            <View style={{ flex: 1.4 }}>
              <SectionTitle>Grafik Harian</SectionTitle>
              <Glass>
                <View style={s.legend}>
                  <View style={[s.dot, { backgroundColor: colors.brandPrimary }]} />
                  <Text style={s.legendText}>Pendapatan</Text>
                  <View style={[s.dot, { backgroundColor: colors.borderStrong, marginLeft: space.md }]} />
                  <Text style={s.legendText}>Pengeluaran</Text>
                </View>
                <View style={s.chart} testID="report-chart">
                  {series.map((x, i) => (
                    <View key={x.date} style={s.barCol}>
                      <View style={s.bars}>
                        <Bar h={(x.revenue / max) * 150} color={colors.brandPrimary} delay={i * 40} />
                        <Bar h={(x.expense / max) * 150} color={colors.borderStrong} delay={i * 40 + 20} />
                      </View>
                      <Text style={s.barLabel}>{x.date.slice(8)}</Text>
                    </View>
                  ))}
                </View>
              </Glass>
            </View>
            <View style={{ flex: 1 }}>
              <SectionTitle>Menu Terlaris</SectionTitle>
              <Glass style={{ gap: space.md }}>
                {d.top_items.length === 0 ? (
                  <Empty icon="fast-food-outline" title="Belum ada penjualan" />
                ) : (
                  d.top_items.map((t, i) => (
                    <FadeInItem key={t.name} index={i} style={s.topRow}>
                      <View style={[s.rank, i === 0 && { backgroundColor: colors.brandPrimary }]}>
                        <Text style={s.rankText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.topName} numberOfLines={1}>{t.name}</Text>
                        <Text style={s.topSub}>{t.qty} terjual</Text>
                      </View>
                      <Text style={s.topRev}>{rp(t.revenue)}</Text>
                    </FadeInItem>
                  ))
                )}
              </Glass>
            </View>
          </View>

          <View style={{ flexDirection: wide ? "row" : "column", gap: space.lg }}>
            <View style={{ flex: 1 }}>
              <SectionTitle>Metode Pembayaran</SectionTitle>
              <Glass style={{ gap: space.md }}>
                {d.methods.length === 0 ? (
                  <Text style={s.topSub}>Belum ada data</Text>
                ) : (
                  d.methods.map((m) => <Progress key={m.method} label={METHOD[m.method] ?? m.method} value={m.amount} total={d.revenue} />)
                )}
              </Glass>
            </View>
            <View style={{ flex: 1 }}>
              <SectionTitle>Kategori Pengeluaran</SectionTitle>
              <Glass style={{ gap: space.md }}>
                {d.expense_categories.length === 0 ? (
                  <Text style={s.topSub}>Belum ada pengeluaran</Text>
                ) : (
                  d.expense_categories.map((m) => <Progress key={m.category} label={m.category} value={m.amount} total={d.expense} color={colors.error} />)
                )}
              </Glass>
            </View>
          </View>
          <Text style={s.footNote}>
            {d.all_orders} pesanan total · {d.from_table} dari meja (NFC/QR)
          </Text>
        </ScrollView>
      )}
    </Shell>
  );
}

function Bar({ h, color, delay }: { h: number; color: string; delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(Math.max(h, 2), { duration: 220 }));
  }, [h, delay, v]);
  const a = useAnimatedStyle(() => ({ height: v.value }));
  return <Animated.View style={[s.bar, { backgroundColor: color }, a]} />;
}

function Progress({ label, value, total, color = colors.brandPrimary }: { label: string; value: number; total: number; color?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(pct, { duration: 220 });
  }, [pct, w]);
  const a = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View>
      <View style={s.progHead}>
        <Text style={s.topName}>{label}</Text>
        <Text style={s.topSub}>
          {rp(value)} · {pct}%
        </Text>
      </View>
      <View style={s.track}>
        <Animated.View style={[s.fill, { backgroundColor: color }, a]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sep: { width: 1, height: 24, backgroundColor: colors.borderStrong, marginHorizontal: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  kpiWrap: { flexGrow: 1 },
  kpi: { borderRadius: radius.lg, padding: space.lg, gap: 6, minHeight: 110 },
  kpiLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, fontWeight: "600" },
  kpiValue: { color: colors.onSurface, fontSize: 22, fontFamily: fonts.display, fontWeight: "800" },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 180, gap: 4 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 150 },
  bar: { width: 7, borderRadius: 4 },
  barLabel: { color: colors.muted, fontSize: 9, marginTop: 6, fontFamily: fonts.text },
  topRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  rank: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rankText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },
  topName: { color: colors.onSurface, fontSize: 14, fontWeight: "600", fontFamily: fonts.text },
  topSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  topRev: { color: colors.brandSecondary, fontWeight: "700", fontSize: 13, fontFamily: fonts.text },
  progHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  footNote: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: space.xl, fontFamily: fonts.text },
});
