import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Badge, Chip, ChipRow, Empty, FadeInItem, Field, GhostButton, GradientButton, IconButton, Ionicons, Loading, SectionTitle, Sheet, Switch, useToast } from "@/src/ui";

type Outlet = { id: string; name: string; address: string };
type Staff = { id: string; name: string; email: string; role: "kasir" | "dapur"; outlet_id: string; active: boolean };

export default function StaffScreen() {
  const toast = useToast();
  const outlets = useQuery({ queryKey: ["outlets"], queryFn: () => api<Outlet[]>("/outlets") });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => api<Staff[]>("/staff") });
  const [outletForm, setOutletForm] = useState<{ id?: string; name: string; address: string } | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: "kasir" | "dapur"; outlet_id: string } | null>(null);

  const inval = () => {
    queryClient.invalidateQueries({ queryKey: ["outlets"] });
    queryClient.invalidateQueries({ queryKey: ["staff"] });
  };
  const onErr = (e: any) => toast(e.message, "err");

  const saveOutlet = useMutation({
    mutationFn: (o: { id?: string; name: string; address: string }) =>
      o.id ? api(`/outlets/${o.id}`, { method: "PATCH", body: { name: o.name, address: o.address } }) : api("/outlets", { method: "POST", body: o }),
    onSuccess: () => {
      inval();
      setOutletForm(null);
      toast("Outlet disimpan");
    },
    onError: onErr,
  });
  const delOutlet = useMutation({
    mutationFn: (id: string) => api(`/outlets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      inval();
      setOutletForm(null);
      toast("Outlet dihapus");
    },
    onError: onErr,
  });
  const addStaff = useMutation({
    mutationFn: () => api("/staff", { method: "POST", body: form }),
    onSuccess: () => {
      inval();
      setForm(null);
      toast("Akun staf dibuat");
    },
    onError: onErr,
  });
  const patchStaff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/staff/${id}`, { method: "PATCH", body }),
    onSuccess: inval,
    onError: onErr,
  });
  const delStaff = useMutation({
    mutationFn: (id: string) => api(`/staff/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      inval();
      toast("Akun dihapus");
    },
  });

  return (
    <Shell
      title="Staf & Outlet"
      subtitle="Akun kasir & dapur untuk multi outlet"
      roles={["admin"]}
      right={<IconButton testID="staff-add-button" icon="person-add" onPress={() => setForm({ name: "", email: "", password: "", role: "kasir", outlet_id: outlets.data?.[0]?.id ?? "" })} />}
    >
      {outlets.isLoading || staff.isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: space.xxl }}>
          <SectionTitle right={<GhostButton testID="outlet-add-button" title="Outlet" icon="add" small onPress={() => setOutletForm({ name: "", address: "" })} />}>Outlet</SectionTitle>
          <View style={{ gap: space.md }}>
            {(outlets.data ?? []).map((o, i) => (
              <FadeInItem key={o.id} index={i}>
                <View style={s.row} testID={`outlet-row-${o.id}`}>
                  <View style={s.icon}>
                    <Ionicons name="storefront" size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{o.name}</Text>
                    <Text style={s.sub}>
                      {staff.data?.filter((x) => x.outlet_id === o.id).length ?? 0} staf{o.address ? ` · ${o.address}` : ""}
                    </Text>
                  </View>
                  <IconButton testID={`outlet-edit-${o.id}`} icon="create-outline" size={38} onPress={() => setOutletForm(o)} />
                </View>
              </FadeInItem>
            ))}
          </View>

          <SectionTitle>Akun Staf</SectionTitle>
          {(staff.data ?? []).length === 0 ? (
            <Empty icon="people-outline" title="Belum ada staf" subtitle="Tambah akun kasir atau dapur" />
          ) : (
            <View style={{ gap: space.md }}>
              {staff.data!.map((u, i) => (
                <FadeInItem key={u.id} index={i}>
                  <View style={[s.row, !u.active && { opacity: 0.5 }]} testID={`staff-row-${u.id}`}>
                    <View style={[s.icon, { backgroundColor: u.role === "dapur" ? colors.error + "22" : colors.info + "22" }]}>
                      <Ionicons name={u.role === "dapur" ? "flame" : "calculator"} size={18} color={u.role === "dapur" ? colors.error : colors.info} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{u.name}</Text>
                      <Text style={s.sub} numberOfLines={1}>{u.email}</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        <Badge label={u.role.toUpperCase()} color={u.role === "dapur" ? colors.error : colors.info} />
                        <Badge label={outlets.data?.find((o) => o.id === u.outlet_id)?.name ?? "-"} color={colors.muted} />
                      </View>
                    </View>
                    <Switch testID={`staff-active-${u.id}`} value={u.active} onChange={(v) => patchStaff.mutate({ id: u.id, body: { active: v } })} />
                    <IconButton testID={`staff-delete-${u.id}`} icon="trash-outline" color={colors.error} size={38} onPress={() => delStaff.mutate(u.id)} />
                  </View>
                </FadeInItem>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet
        visible={!!form}
        onClose={() => setForm(null)}
        title="Tambah Akun Staf"
        testID="staff-form-sheet"
        footer={<GradientButton testID="staff-save-button" title="Buat Akun" icon="checkmark" loading={addStaff.isPending} onPress={() => addStaff.mutate()} />}
      >
        {form && (
          <View>
            <Text style={s.label}>Role</Text>
            <ChipRow>
              <Chip testID="staff-role-kasir" icon="calculator" label="Kasir" active={form.role === "kasir"} onPress={() => setForm({ ...form, role: "kasir" })} />
              <Chip testID="staff-role-dapur" icon="flame" label="Dapur" active={form.role === "dapur"} onPress={() => setForm({ ...form, role: "dapur" })} />
            </ChipRow>
            <Text style={s.label}>Outlet</Text>
            <ChipRow>
              {(outlets.data ?? []).map((o) => (
                <Chip key={o.id} testID={`staff-outlet-${o.id}`} label={o.name} active={form.outlet_id === o.id} onPress={() => setForm({ ...form, outlet_id: o.id })} />
              ))}
            </ChipRow>
            <Field testID="staff-name-input" label="Nama" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} placeholder="Nama staf" />
            <Field testID="staff-email-input" label="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} placeholder="kasir@resto.com" />
            <Field testID="staff-password-input" label="Password (min. 6 karakter)" secureTextEntry value={form.password} onChangeText={(t) => setForm({ ...form, password: t })} placeholder="••••••" />
          </View>
        )}
      </Sheet>

      <Sheet
        visible={!!outletForm}
        onClose={() => setOutletForm(null)}
        title={outletForm?.id ? "Edit Outlet" : "Tambah Outlet"}
        testID="outlet-form-sheet"
        footer={
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {outletForm?.id ? <GhostButton testID="outlet-delete-button" title="Hapus" icon="trash" danger onPress={() => delOutlet.mutate(outletForm.id!)} /> : null}
            <GradientButton testID="outlet-save-button" title="Simpan" icon="checkmark" style={{ flex: 1 }} loading={saveOutlet.isPending} onPress={() => outletForm && saveOutlet.mutate(outletForm)} />
          </View>
        }
      >
        {outletForm && (
          <View>
            <Field testID="outlet-name-input" label="Nama outlet" value={outletForm.name} onChangeText={(t) => setOutletForm({ ...outletForm, name: t })} placeholder="Contoh: Cabang Kemang" />
            <Field testID="outlet-address-input" label="Alamat" value={outletForm.address} onChangeText={(t) => setOutletForm({ ...outletForm, address: t })} placeholder="Alamat outlet" />
          </View>
        )}
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.md },
  icon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 15, fontFamily: fonts.text },
  sub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", fontFamily: fonts.text },
});
