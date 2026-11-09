import { Image } from "expo-image";
import { Redirect, usePathname, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fileUrl } from "@/src/api";
import { Role, homeFor, useAuth } from "@/src/auth";
import { colors, fonts, radius, space } from "@/src/theme";
import { IconButton, IconName, Ionicons, PressScale, Sheet, useWide } from "@/src/ui";

type NavItem = { href: string; label: string; icon: IconName; roles: Role[] };
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid", roles: ["admin"] },
  { href: "/pos", label: "Kasir", icon: "calculator", roles: ["admin", "kasir"] },
  { href: "/orders", label: "Pesanan", icon: "receipt", roles: ["admin", "kasir"] },
  { href: "/kitchen", label: "Dapur", icon: "flame", roles: ["admin", "dapur"] },
  { href: "/menu", label: "Menu", icon: "fast-food", roles: ["admin"] },
  { href: "/tables", label: "Meja & QR", icon: "qr-code", roles: ["admin", "kasir"] },
  { href: "/staff", label: "Staf & Outlet", icon: "people", roles: ["admin"] },
  { href: "/expenses", label: "Pengeluaran", icon: "wallet", roles: ["admin"] },
  { href: "/settings", label: "Pengaturan", icon: "settings", roles: ["admin"] },
];

export function Shell({
  title,
  subtitle,
  roles,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  roles: Role[];
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const { me, ready, logout } = useAuth();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);

  if (!ready) return <View style={s.root} />;
  if (!me) return <Redirect href="/login" />;
  if (!roles.includes(me.user.role)) return <Redirect href={homeFor(me.user.role)} />;

  const items = NAV.filter((n) => n.roles.includes(me.user.role));
  const mobileMain = items.slice(0, items.length > 4 ? 3 : 4);
  const mobileMore = items.length > 4 ? items.slice(3) : [];
  const showBottom = !wide && items.length > 1;
  const go = (h: string) => {
    setMore(false);
    if (h !== path) router.replace(h as any);
  };
  const restoName = me.restaurant?.name ?? "Founder Panel";
  const sidebar = wide && items.length > 1;
  const logo = fileUrl(me.restaurant?.logo_path);

  const Brand = (
    <View style={s.brandRow}>
      <View style={s.logo}>
        {logo ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={s.logoText}>{restoName[0] ?? "R"}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.brandName} numberOfLines={1} testID="shell-restaurant-name">{restoName}</Text>
        <Text style={s.brandSub} numberOfLines={1}>
          {me.user.name} · {me.user.role.toUpperCase()}
          {me.outlet ? ` · ${me.outlet.name}` : ""}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <View style={s.glowA} pointerEvents="none" />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {sidebar && (
          <View style={[s.side, { paddingTop: insets.top + space.xl }]}>
            {Brand}
            <View style={{ marginTop: space.xl, gap: 4, flex: 1 }}>
              {items.map((n) => {
                const on = path.startsWith(n.href);
                return (
                  <Pressable key={n.href} testID={`nav-${n.href.slice(1)}`} onPress={() => go(n.href)} style={[s.sideItem, on && s.sideItemOn]}>
                    <Ionicons name={n.icon} size={18} color={on ? colors.brandPrimary : colors.muted} />
                    <Text style={[s.sideText, on && { color: colors.onSurface }]}>{n.label}</Text>
                    {on && <Animated.View entering={FadeIn} style={s.sideDot} />}
                  </Pressable>
                );
              })}
            </View>
            <Pressable testID="logout-button" onPress={logout} style={[s.sideItem, { marginBottom: insets.bottom + space.lg }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={[s.sideText, { color: colors.error }]}>Keluar</Text>
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={[s.header, { paddingTop: insets.top + space.md }]}>
            <View style={{ flex: 1 }}>
              {!sidebar && <Text style={s.headerResto} numberOfLines={1}>{restoName}{me.outlet ? ` · ${me.outlet.name}` : ""}</Text>}
              <Text style={s.headerTitle} numberOfLines={1} testID="screen-title">{title}</Text>
              {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            {right}
            {!sidebar && <IconButton testID="logout-button" icon="log-out-outline" color={colors.error} onPress={logout} />}
          </View>
          <View style={{ flex: 1 }}>{children}</View>
          {showBottom && (
            <View style={[s.bottom, { paddingBottom: insets.bottom + space.sm }]}>
              {mobileMain.map((n) => {
                const on = path.startsWith(n.href);
                return (
                  <PressScale key={n.href} testID={`tab-${n.href.slice(1)}`} onPress={() => go(n.href)} style={s.tab}>
                    <View style={[s.tabIcon, on && s.tabIconOn]}>
                      <Ionicons name={n.icon} size={20} color={on ? colors.onBrandPrimary : colors.muted} />
                    </View>
                    <Text style={[s.tabText, on && { color: colors.brandPrimary }]} numberOfLines={1}>{n.label}</Text>
                  </PressScale>
                );
              })}
              {mobileMore.length > 0 && (
                <PressScale testID="tab-more" onPress={() => setMore(true)} style={s.tab}>
                  <View style={[s.tabIcon, mobileMore.some((n) => path.startsWith(n.href)) && s.tabIconOn]}>
                    <Ionicons name="apps" size={20} color={mobileMore.some((n) => path.startsWith(n.href)) ? colors.onBrandPrimary : colors.muted} />
                  </View>
                  <Text style={s.tabText}>Lainnya</Text>
                </PressScale>
              )}
            </View>
          )}
        </View>
      </View>
      <Sheet visible={more} onClose={() => setMore(false)} title="Menu Lainnya" testID="more-sheet">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          {mobileMore.map((n) => (
            <PressScale key={n.href} testID={`more-${n.href.slice(1)}`} onPress={() => go(n.href)} style={s.moreItem}>
              <View style={s.moreIcon}>
                <Ionicons name={n.icon} size={22} color={colors.brandPrimary} />
              </View>
              <Text style={s.moreText}>{n.label}</Text>
            </PressScale>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, overflow: "hidden" },
  glowA: { position: "absolute", width: 360, height: 360, borderRadius: 180, backgroundColor: colors.brandPrimary, opacity: 0.08, top: -160, right: -120 },
  side: { width: 250, borderRightWidth: 1, borderRightColor: colors.glassBorder, paddingHorizontal: space.lg, backgroundColor: colors.glass },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 18, fontFamily: fonts.display },
  brandName: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "700", fontSize: 15 },
  brandSub: { color: colors.muted, fontSize: 11, marginTop: 2, fontFamily: fonts.text },
  sideItem: { flexDirection: "row", alignItems: "center", gap: space.md, height: 46, paddingHorizontal: space.md, borderRadius: radius.md },
  sideItemOn: { backgroundColor: colors.brandTertiary },
  sideText: { color: colors.muted, fontFamily: fonts.text, fontWeight: "600", fontSize: 14, flex: 1 },
  sideDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  headerResto: { color: colors.brandSecondary, fontSize: 12, fontFamily: fonts.text, fontWeight: "600" },
  headerTitle: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "800", fontSize: 26, letterSpacing: -0.5 },
  headerSub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  bottom: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
  },
  tab: { flex: 1, alignItems: "center", gap: 4, minHeight: 48 },
  tabIcon: { width: 44, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tabIconOn: { backgroundColor: colors.brandPrimary },
  tabText: { fontSize: 11, color: colors.muted, fontFamily: fonts.text, fontWeight: "600" },
  moreItem: { width: "30%", flexGrow: 1, alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary },
  moreIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  moreText: { color: colors.onSurface, fontSize: 12, fontWeight: "600", fontFamily: fonts.text, textAlign: "center" },
});
