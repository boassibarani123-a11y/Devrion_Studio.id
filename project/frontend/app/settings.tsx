import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, fileUrl } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useImageUpload } from "@/src/pick-image";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Field, GhostButton, Glass, GradientButton, IconButton, Ionicons, Loading, PressScale, SectionTitle, Sheet, Switch, useToast, useWide } from "@/src/ui";

type Bank = { id: string; bank: string; number: string; holder: string; enabled: boolean };
type Settings = { name: string; tagline: string; address: string; phone: string; logo_path: string | null; qris_enabled: boolean; qris_path: string | null; bank_accounts: Bank[] };

export default function SettingsScreen() {
  const toast = useToast();
  const wide = useWide();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const [f, setF] = useState<Settings | null>(null);
  const [bank, setBank] = useState<{ bank: string; number: string; holder: string } | null>(null);
  useEffect(() => {
    if (q.data && !f) setF(q.data);
  }, [q.data, f]);

  const save = useMutation({
    mutationFn: (body: Partial<Settings>) => api<Settings>("/settings", { method: "PATCH", body }),
    onSuccess: (d) => {
      queryClient.setQueryData(["settings"], d);
      setF(d);
      refresh();
      toast("Pengaturan disimpan");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const logo = useImageUpload("logo", (p) => save.mutate({ logo_path: p }));
  const qris = useImageUpload("qris", (p) => save.mutate({ qris_path: p, qris_enabled: true }));

  if (!f) return <Shell title="Pengaturan" roles={["admin"]}><Loading /></Shell>;

  const banks = f.bank_accounts ?? [];
  const setBanks = (b: Bank[]) => save.mutate({ bank_accounts: b });

  return (
    <Shell title="Pengaturan" subtitle="Identitas resto & pembayaran" roles={["admin"]}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: wide ? "row" : "column", gap: space.lg }}>
          <View style={{ flex: 1 }}>
            <SectionTitle>Profil Resto</SectionTitle>
            <Glass>
              <View style={s.logoRow}>
                <PressScale testID="settings-logo-picker" onPress={logo.pick} style={s.logo}>
                  {f.logo_path ? (
                    <Image source={{ uri: fileUrl(f.logo_path) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Ionicons name="image-outline" size={28} color={colors.brandPrimary} />
                  )}
                  <View style={s.logoEdit}>
                    <Ionicons name={logo.uploading ? "cloud-upload" : "camera"} size={14} color={colors.onBrandPrimary} />
                  </View>
                </PressScale>
                <View style={{ flex: 1 }}>
                  <Text style={s.h}>Logo Resto</Text>
                  <Text style={s.sub}>Tampil di aplikasi & halaman menu pelanggan</Text>
                </View>
              </View>
              <Field testID="settings-name-input" label="Nama resto" value={f.name} onChangeText={(t) => setF({ ...f, name: t })} />
              <Field testID="settings-tagline-input" label="Tagline" value={f.tagline} onChangeText={(t) => setF({ ...f, tagline: t })} placeholder="Good Food, Good Mood!" />
              <Field testID="settings-address-input" label="Alamat" value={f.address} onChangeText={(t) => setF({ ...f, address: t })} />
              <Field testID="settings-phone-input" label="Telepon" keyboardType="phone-pad" value={f.phone} onChangeText={(t) => setF({ ...f, phone: t })} />
              <GradientButton
                testID="settings-save-button"
                title="Simpan Profil"
                icon="checkmark"
                loading={save.isPending}
                onPress={() => save.mutate({ name: f.name, tagline: f.tagline, address: f.address, phone: f.phone })}
              />
            </Glass>
          </View>

          <View style={{ flex: 1 }}>
            <SectionTitle>QRIS</SectionTitle>
            <Glass style={{ gap: space.md }}>
              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.h}>Aktifkan QRIS</Text>
                  <Text style={s.sub}>Pelanggan bisa scan QRIS saat memesan</Text>
                </View>
                <Switch
                  testID="settings-qris-switch"
                  value={f.qris_enabled}
                  onChange={(v) => {
                    if (v && !f.qris_path) return toast("Upload foto QRIS terlebih dahulu", "err");
                    setF({ ...f, qris_enabled: v });
                    save.mutate({ qris_enabled: v });
                  }}
                />
              </View>
              <PressScale testID="settings-qris-picker" onPress={qris.pick} style={s.qris}>
                {f.qris_path ? (
                  <Image source={{ uri: fileUrl(f.qris_path) }} style={StyleSheet.absoluteFill} contentFit="contain" />
                ) : (
                  <View style={{ alignItems: "center", gap: 6 }}>
                    <Ionicons name="qr-code-outline" size={32} color={colors.brandPrimary} />
                    <Text style={s.sub}>{qris.uploading ? "Mengunggah…" : "Upload foto QRIS"}</Text>
                  </View>
                )}
              </PressScale>
            </Glass>

            <SectionTitle right={<GhostButton testID="bank-add-button" title="Rekening" icon="add" small onPress={() => setBank({ bank: "", number: "", holder: "" })} />}>
              Rekening Bank
            </SectionTitle>
            <View style={{ gap: space.md }}>
              {banks.length === 0 ? (
                <Text style={s.sub}>Belum ada rekening. Tambahkan agar pelanggan bisa transfer.</Text>
              ) : (
                banks.map((b) => (
                  <View key={b.id} style={[s.bank, !b.enabled && { opacity: 0.5 }]} testID={`bank-row-${b.id}`}>
                    <View style={s.bankIcon}>
                      <Ionicons name="card" size={18} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.h}>
                        {b.bank} · {b.number}
                      </Text>
                      <Text style={s.sub}>a.n {b.holder}</Text>
                    </View>
                    <Switch testID={`bank-enabled-${b.id}`} value={b.enabled} onChange={(v) => setBanks(banks.map((x) => (x.id === b.id ? { ...x, enabled: v } : x)))} />
                    <IconButton testID={`bank-delete-${b.id}`} icon="trash-outline" color={colors.error} size={36} onPress={() => setBanks(banks.filter((x) => x.id !== b.id))} />
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
      {logo.sheet}
      {qris.sheet}
      <Sheet
        visible={!!bank}
        onClose={() => setBank(null)}
        title="Tambah Rekening"
        testID="bank-form-sheet"
        footer={
          <GradientButton
            testID="bank-save-button"
            title="Simpan"
            icon="checkmark"
            disabled={!bank?.bank.trim() || !bank?.number.trim() || !bank?.holder.trim()}
            onPress={() => {
              setBanks([...banks, { id: Math.random().toString(36).slice(2), enabled: true, ...bank! }]);
              setBank(null);
            }}
          />
        }
      >
        {bank && (
          <View>
            <Field testID="bank-name-input" label="Nama bank" value={bank.bank} onChangeText={(t) => setBank({ ...bank, bank: t })} placeholder="BCA / Mandiri / BRI" />
            <Field testID="bank-number-input" label="Nomor rekening" keyboardType="number-pad" value={bank.number} onChangeText={(t) => setBank({ ...bank, number: t })} />
            <Field testID="bank-holder-input" label="Atas nama" value={bank.holder} onChangeText={(t) => setBank({ ...bank, holder: t })} />
          </View>
        )}
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  logoRow: { flexDirection: "row", alignItems: "center", gap: space.lg, marginBottom: space.lg },
  logo: { width: 76, height: 76, borderRadius: radius.lg, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoEdit: { position: "absolute", right: 4, bottom: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  h: { color: colors.onSurface, fontWeight: "700", fontSize: 14, fontFamily: fonts.text },
  sub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  qris: { height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong },
  bank: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.md },
  bankIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
});
