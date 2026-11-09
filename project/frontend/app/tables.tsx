import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useState } from "react";
import { FlatList, Linking, Platform, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { API, api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Chip, ChipRow, Empty, Field, GhostButton, GradientButton, IconButton, Ionicons, Loading, Sheet, useToast, useWide } from "@/src/ui";

type Table = { id: string; name: string; outlet_id: string; code: string; link: string };
type Outlet = { id: string; name: string };

export default function Tables() {
  const { me } = useAuth();
  const isAdmin = me?.user.role === "admin";
  const toast = useToast();
  const wide = useWide();
  const [add, setAdd] = useState(false);
  const [name, setName] = useState("");
  const [outlet, setOutlet] = useState<string | null>(null);
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => api<Table[]>("/tables") });
  const outlets = useQuery({ queryKey: ["outlets"], queryFn: () => api<Outlet[]>("/outlets") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tables"] });

  const create = useMutation({
    mutationFn: () => api("/tables", { method: "POST", body: { name: name.trim(), outlet_id: outlet ?? outlets.data?.[0]?.id } }),
    onSuccess: () => {
      refresh();
      setAdd(false);
      setName("");
      toast("Meja ditambahkan");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const regen = useMutation({
    mutationFn: (id: string) => api(`/tables/${id}/regenerate`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast("Link baru dibuat. Tulis ulang ke NFC tag.");
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/tables/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast("Meja dihapus");
    },
  });

  const copy = async (link: string) => {
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(link);
        toast("Link disalin");
      } catch {
        toast(link, "info");
      }
    } else Share.share({ message: link });
  };

  return (
    <Shell
      title="Meja & QR"
      subtitle="Link tiap meja untuk QR Code & NFC"
      roles={["admin", "kasir"]}
      right={isAdmin ? <IconButton testID="table-add-button" icon="add" onPress={() => setAdd(true)} /> : undefined}
    >
      {tables.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          key={wide ? "w" : "n"}
          data={tables.data}
          numColumns={wide ? 3 : 1}
          columnWrapperStyle={wide ? { gap: space.md } : undefined}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: space.lg, paddingTop: 0, gap: space.md, paddingBottom: space.xl }}
          ListHeaderComponent={
            <View style={s.info}>
              <Ionicons name="wifi" size={20} color={colors.brandPrimary} />
              <Text style={s.infoText}>
                Cetak QR atau tulis link ke kartu NFC (mis. dengan aplikasi NFC Tools → Write → URL). Pelanggan cukup tap/scan untuk langsung membuka menu tanpa login.
              </Text>
            </View>
          }
          ListEmptyComponent={<Empty icon="qr-code-outline" title="Belum ada meja" subtitle={isAdmin ? "Tap + untuk menambah meja" : undefined} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50)} style={[s.card, { flex: wide ? 1 / 3 : undefined }]} testID={`table-card-${item.id}`}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name}</Text>
                  <Text style={s.sub}>{outlets.data?.find((o) => o.id === item.outlet_id)?.name}</Text>
                </View>
                {isAdmin && (
                  <>
                    <IconButton testID={`table-regen-${item.id}`} icon="refresh" size={38} onPress={() => regen.mutate(item.id)} />
                    <IconButton testID={`table-delete-${item.id}`} icon="trash-outline" color={colors.error} size={38} onPress={() => del.mutate(item.id)} />
                  </>
                )}
              </View>
              <View style={s.qrWrap}>
                <Image testID={`table-qr-${item.id}`} source={{ uri: `${API}/qr/${item.code}.png` }} style={s.qr} contentFit="contain" />
              </View>
              <Text style={s.link} numberOfLines={1} selectable testID={`table-link-${item.id}`}>
                {item.link}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <GhostButton testID={`table-copy-${item.id}`} title={Platform.OS === "web" ? "Salin" : "Bagikan"} icon="copy-outline" small style={{ flex: 1 }} onPress={() => copy(item.link)} />
                <GradientButton testID={`table-open-${item.id}`} title="Buka Menu" icon="open-outline" small style={{ flex: 1 }} onPress={() => Linking.openURL(item.link)} />
              </View>
            </Animated.View>
          )}
        />
      )}
      <Sheet
        visible={add}
        onClose={() => setAdd(false)}
        title="Tambah Meja"
        testID="table-form-sheet"
        footer={<GradientButton testID="table-save-button" title="Simpan" icon="checkmark" disabled={!name.trim()} loading={create.isPending} onPress={() => create.mutate()} />}
      >
        <Field testID="table-name-input" label="Nama meja" value={name} onChangeText={setName} placeholder="Contoh: Meja 5 / VIP 1" />
        <Text style={s.label}>Outlet</Text>
        <ChipRow>
          {(outlets.data ?? []).map((o) => (
            <Chip key={o.id} testID={`table-outlet-${o.id}`} label={o.name} active={(outlet ?? outlets.data?.[0]?.id) === o.id} onPress={() => setOutlet(o.id)} />
          ))}
        </ChipRow>
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  info: { flexDirection: "row", gap: space.md, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  infoText: { color: colors.onBrandTertiary, fontSize: 13, lineHeight: 19, flex: 1, fontFamily: fonts.text },
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "700", fontSize: 18 },
  sub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  qrWrap: { alignSelf: "center", backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: space.md },
  qr: { width: 170, height: 170 },
  link: { color: colors.brandSecondary, fontSize: 12, fontFamily: fonts.text, textAlign: "center" },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", fontFamily: fonts.text },
});
