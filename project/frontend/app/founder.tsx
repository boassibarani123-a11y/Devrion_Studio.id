import { useMutation, useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Badge, Empty, FadeInItem, Field, GradientButton, IconButton, Ionicons, Loading, PressScale, Sheet, Switch, useToast, useWide } from "@/src/ui";

type Resto = {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  city: string;
  active: boolean;
  admin_email: string;
  created_at: string;
  stats: { outlets: number; staff: number; tables: number; menu: number };
};
type Form = { id?: string; name: string; owner_name: string; phone: string; address: string; city: string; admin_email: string; admin_password: string; admin_name: string; active?: boolean };
const EMPTY: Form = { name: "", owner_name: "", phone: "", address: "", city: "", admin_email: "", admin_password: "", admin_name: "Admin" };

export default function Founder() {
  const toast = useToast();
  const wide = useWide();
  const [form, setForm] = useState<Form | null>(null);
  const q = useQuery({ queryKey: ["founder"], queryFn: () => api<Resto[]>("/founder/restaurants") });
  const list = q.data ?? [];

  const save = useMutation({
    mutationFn: (f: Form) => {
      if (f.id) {
        const body: any = { name: f.name, owner_name: f.owner_name, phone: f.phone, address: f.address, city: f.city, active: f.active };
        if (f.admin_password) body.admin_password = f.admin_password;
        return api(`/founder/restaurants/${f.id}`, { method: "PATCH", body });
      }
      return api("/founder/restaurants", { method: "POST", body: f });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder"] });
      setForm(null);
      toast("Data resto disimpan");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => api(`/founder/restaurants/${id}`, { method: "PATCH", body: { active: v } }),
    onMutate: ({ id, v }) => queryClient.setQueryData<Resto[]>(["founder"], (o) => o?.map((r) => (r.id === id ? { ...r, active: v } : r))),
    onSuccess: (_d, v) => toast(v.v ? "Resto diaktifkan" : "Resto dinonaktifkan"),
  });

  const stats = [
    { label: "Total Resto", value: list.length, icon: "storefront" as const },
    { label: "Aktif", value: list.filter((r) => r.active).length, icon: "checkmark-circle" as const },
    { label: "Outlet", value: list.reduce((a, r) => a + r.stats.outlets, 0), icon: "git-branch" as const },
    { label: "Staf", value: list.reduce((a, r) => a + r.stats.staff, 0), icon: "people" as const },
  ];

  return (
    <Shell title="Founder Panel" subtitle="Pantau semua Cafe & Resto terdaftar" roles={["founder"]} right={<IconButton testID="founder-add-button" icon="add" onPress={() => setForm({ ...EMPTY })} />}>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          key={wide ? "w" : "n"}
          data={list}
          numColumns={wide ? 3 : 1}
          columnWrapperStyle={wide ? { gap: space.md } : undefined}
          keyExtractor={(r) => r.id}
          refreshControl={<RefreshControl tintColor={colors.brandPrimary} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: space.xxl }}
          ListHeaderComponent={
            <View style={s.statGrid}>
              {stats.map((x, i) => (
                <FadeInItem key={x.label} index={i} style={{ flexGrow: 1, flexBasis: wide ? "22%" : "45%" }}>
                  {i === 0 ? (
                    <LinearGradient colors={[colors.brandPrimary, colors.brandDeep]} style={s.stat}>
                      <Ionicons name={x.icon} size={20} color={colors.onBrandPrimary} />
                      <Text style={[s.statValue, { color: colors.onBrandPrimary }]} testID="founder-stat-total">{x.value}</Text>
                      <Text style={[s.statLabel, { color: colors.onBrandTertiary }]}>{x.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[s.stat, s.glass]}>
                      <Ionicons name={x.icon} size={20} color={colors.brandPrimary} />
                      <Text style={s.statValue}>{x.value}</Text>
                      <Text style={s.statLabel}>{x.label}</Text>
                    </View>
                  )}
                </FadeInItem>
              ))}
            </View>
          }
          ListEmptyComponent={<Empty icon="storefront-outline" title="Belum ada resto" subtitle="Tap + untuk mendaftarkan Cafe & Resto pertama" />}
          renderItem={({ item, index }) => (
            <FadeInItem index={index} style={{ flex: wide ? 1 / 3 : undefined }}>
              <PressScale testID={`founder-resto-${item.id}`} onPress={() => setForm({ ...EMPTY, ...item, admin_password: "" })} style={[s.card, !item.active && { opacity: 0.6 }]}>
                <View style={s.head}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{item.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.sub} numberOfLines={1}>
                      {item.city || "-"} · {item.owner_name || "Pemilik"}
                    </Text>
                  </View>
                  <Switch testID={`founder-active-${item.id}`} value={item.active} onChange={(v) => toggle.mutate({ id: item.id, v })} />
                </View>
                <Badge label={item.active ? "AKTIF" : "NONAKTIF"} color={item.active ? colors.success : colors.error} />
                <View style={s.metrics}>
                  {[
                    ["Outlet", item.stats.outlets],
                    ["Staf", item.stats.staff],
                    ["Meja", item.stats.tables],
                    ["Menu", item.stats.menu],
                  ].map(([l, v]) => (
                    <View key={l as string} style={s.metric}>
                      <Text style={s.metricV}>{v}</Text>
                      <Text style={s.metricL}>{l}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.adminRow}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.muted} />
                  <Text style={s.sub} numberOfLines={1}>{item.admin_email}</Text>
                </View>
              </PressScale>
            </FadeInItem>
          )}
        />
      )}
      <Sheet
        visible={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit Resto" : "Daftarkan Resto Baru"}
        testID="founder-form-sheet"
        footer={<GradientButton testID="founder-save-button" title="Simpan" icon="checkmark" loading={save.isPending} onPress={() => form && save.mutate(form)} />}
      >
        {form && (
          <View>
            <Field testID="founder-name-input" label="Nama Cafe / Resto" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
            <Field testID="founder-owner-input" label="Nama pemilik" value={form.owner_name} onChangeText={(t) => setForm({ ...form, owner_name: t })} />
            <Field testID="founder-phone-input" label="Telepon" keyboardType="phone-pad" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} />
            <Field testID="founder-city-input" label="Kota" value={form.city} onChangeText={(t) => setForm({ ...form, city: t })} />
            <Field testID="founder-address-input" label="Alamat" value={form.address} onChangeText={(t) => setForm({ ...form, address: t })} />
            <Text style={s.section}>Akun Admin Resto</Text>
            {form.id ? (
              <Text style={[s.sub, { marginBottom: space.md }]}>{form.admin_email}</Text>
            ) : (
              <>
                <Field testID="founder-admin-name-input" label="Nama admin" value={form.admin_name} onChangeText={(t) => setForm({ ...form, admin_name: t })} />
                <Field testID="founder-admin-email-input" label="Email admin" autoCapitalize="none" keyboardType="email-address" value={form.admin_email} onChangeText={(t) => setForm({ ...form, admin_email: t })} />
              </>
            )}
            <Field
              testID="founder-admin-password-input"
              label={form.id ? "Reset password admin (opsional)" : "Password admin (min. 6)"}
              secureTextEntry
              value={form.admin_password}
              onChangeText={(t) => setForm({ ...form, admin_password: t })}
            />
            <View style={s.privacy}>
              <Ionicons name="lock-closed" size={14} color={colors.muted} />
              <Text style={s.sub}>Data penghasilan resto bersifat privat & tidak ditampilkan ke Founder.</Text>
            </View>
          </View>
        )}
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginBottom: space.lg },
  stat: { borderRadius: radius.lg, padding: space.lg, gap: 4 },
  glass: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  statValue: { color: colors.onSurface, fontSize: 28, fontWeight: "800", fontFamily: fonts.display, marginTop: 4 },
  statLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, fontWeight: "600" },
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 20, fontFamily: fonts.display },
  name: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "700", fontSize: 17 },
  sub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, flexShrink: 1 },
  metrics: { flexDirection: "row", gap: space.sm },
  metric: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: space.sm, alignItems: "center" },
  metricV: { color: colors.onSurface, fontWeight: "800", fontSize: 16, fontFamily: fonts.display },
  metricL: { color: colors.muted, fontSize: 11, fontFamily: fonts.text },
  adminRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  section: { color: colors.brandSecondary, fontWeight: "700", fontSize: 13, marginTop: space.sm, marginBottom: space.md, fontFamily: fonts.text },
  privacy: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: space.sm },
});
