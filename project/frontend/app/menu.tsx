import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api, fileUrl, menuImage, rp } from "@/src/api";
import { useImageUpload } from "@/src/pick-image";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Chip, ChipRow, Empty, Field, GhostButton, GradientButton, IconButton, Ionicons, Loading, PressScale, Sheet, Switch, useToast, useWide } from "@/src/ui";

type Menu = { id: string; name: string; description: string; price: number; category_id: string; image_path?: string | null; image_url?: string | null; available: boolean; badge: string };
type Cat = { id: string; name: string; icon: string; sort: number };
const EMPTY: Omit<Menu, "id"> = { name: "", description: "", price: 0, category_id: "", image_path: null, image_url: null, available: true, badge: "" };

export default function MenuScreen() {
  const toast = useToast();
  const wide = useWide();
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<(Omit<Menu, "id"> & { id?: string }) | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const [catName, setCatName] = useState("");
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<Menu[]>("/menu") });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Cat[]>("/categories") });
  const list = useMemo(() => (menu.data ?? []).filter((m) => cat === "all" || m.category_id === cat), [menu.data, cat]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["menu"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const save = useMutation({
    mutationFn: (m: Omit<Menu, "id"> & { id?: string }) => {
      const body = { ...m, price: Number(m.price) || 0 };
      delete (body as any).id;
      return m.id ? api(`/menu/${m.id}`, { method: "PATCH", body }) : api("/menu", { method: "POST", body });
    },
    onSuccess: () => {
      refresh();
      setEdit(null);
      toast("Menu disimpan");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/menu/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      setEdit(null);
      toast("Menu dihapus");
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => api(`/menu/${id}/availability?available=${v}`, { method: "PATCH" }),
    onMutate: ({ id, v }) => queryClient.setQueryData<Menu[]>(["menu"], (o) => o?.map((m) => (m.id === id ? { ...m, available: v } : m))),
  });
  const addCat = useMutation({
    mutationFn: () => api("/categories", { method: "POST", body: { name: catName.trim(), sort: (cats.data?.length ?? 0) + 1 } }),
    onSuccess: () => {
      setCatName("");
      refresh();
      toast("Kategori ditambahkan");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const delCat = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast("Kategori dihapus");
    },
    onError: (e: any) => toast(e.message, "err"),
  });

  const img = useImageUpload("menu", (p) => setEdit((e) => (e ? { ...e, image_path: p } : e)));
  const cols = wide ? 4 : 2;

  return (
    <Shell
      title="Menu"
      subtitle={`${menu.data?.length ?? 0} menu · ${cats.data?.length ?? 0} kategori`}
      roles={["admin"]}
      right={<IconButton testID="menu-add-button" icon="add" onPress={() => setEdit({ ...EMPTY, category_id: cats.data?.[0]?.id ?? "" })} />}
    >
      <View style={{ paddingHorizontal: space.lg }}>
        <ChipRow>
          <Chip testID="menu-cat-manage" icon="options" label="Kategori" onPress={() => setCatSheet(true)} />
          <Chip testID="menu-cat-all" label="Semua" active={cat === "all"} onPress={() => setCat("all")} />
          {(cats.data ?? []).map((c) => (
            <Chip key={c.id} testID={`menu-cat-${c.id}`} label={c.name} active={cat === c.id} onPress={() => setCat(c.id)} />
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
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: space.xl }}
          ListEmptyComponent={<Empty icon="fast-food-outline" title="Belum ada menu" subtitle="Tap + untuk menambahkan menu pertama" />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40)} style={{ flex: 1 / cols }}>
              <PressScale testID={`menu-item-${item.id}`} onPress={() => setEdit(item)} style={[s.card, !item.available && { opacity: 0.55 }]}>
                <Image source={{ uri: menuImage(item) }} style={s.img} contentFit="cover" transition={300} />
                {item.badge ? (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{item.badge}</Text>
                  </View>
                ) : null}
                <View style={{ padding: space.md, gap: 4 }}>
                  <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.cat} numberOfLines={1}>{cats.data?.find((c) => c.id === item.category_id)?.name}</Text>
                  <View style={s.row}>
                    <Text style={s.price}>{rp(item.price)}</Text>
                    <Switch testID={`menu-available-${item.id}`} value={item.available} onChange={(v) => toggle.mutate({ id: item.id, v })} />
                  </View>
                </View>
              </PressScale>
            </Animated.View>
          )}
        />
      )}

      <Sheet
        visible={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit Menu" : "Tambah Menu"}
        testID="menu-form-sheet"
        footer={
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {edit?.id ? <GhostButton testID="menu-delete-button" title="Hapus" icon="trash" danger onPress={() => del.mutate(edit.id!)} /> : null}
            <GradientButton
              testID="menu-save-button"
              title="Simpan"
              icon="checkmark"
              loading={save.isPending}
              style={{ flex: 1 }}
              onPress={() => {
                if (!edit?.name.trim() || !edit.category_id) return toast("Nama & kategori wajib diisi", "err");
                save.mutate(edit);
              }}
            />
          </View>
        }
      >
        {edit && (
          <View>
            <PressScale testID="menu-photo-picker" onPress={img.pick} style={s.photo}>
              {edit.image_path || edit.image_url ? (
                <Image source={{ uri: edit.image_path ? fileUrl(edit.image_path) : edit.image_url! }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              <View style={s.photoOverlay}>
                <Ionicons name={img.uploading ? "cloud-upload" : "camera"} size={22} color={colors.onSurface} />
                <Text style={s.photoText}>{img.uploading ? "Mengunggah…" : "Upload Foto Menu"}</Text>
              </View>
            </PressScale>
            <Field testID="menu-name-input" label="Nama menu" value={edit.name} onChangeText={(t) => setEdit({ ...edit, name: t })} placeholder="Contoh: Nasi Goreng" />
            <Field testID="menu-desc-input" label="Deskripsi" value={edit.description} onChangeText={(t) => setEdit({ ...edit, description: t })} placeholder="Bahan & rasa" />
            <Field
              testID="menu-price-input"
              label="Harga (Rp)"
              keyboardType="number-pad"
              value={edit.price ? String(edit.price) : ""}
              onChangeText={(t) => setEdit({ ...edit, price: Number(t.replace(/\D/g, "")) || 0 })}
              placeholder="25000"
            />
            <Field testID="menu-badge-input" label="Label (opsional)" value={edit.badge} onChangeText={(t) => setEdit({ ...edit, badge: t })} placeholder="Best / Spicy / New" />
            <Text style={s.label}>Kategori</Text>
            <ChipRow>
              {(cats.data ?? []).map((c) => (
                <Chip key={c.id} testID={`menu-form-cat-${c.id}`} label={c.name} active={edit.category_id === c.id} onPress={() => setEdit({ ...edit, category_id: c.id })} />
              ))}
            </ChipRow>
            <View style={[s.row, { marginTop: space.md }]}>
              <Text style={s.name}>Tersedia untuk dipesan</Text>
              <Switch testID="menu-form-available" value={edit.available} onChange={(v) => setEdit({ ...edit, available: v })} />
            </View>
          </View>
        )}
      </Sheet>
      {img.sheet}

      <Sheet visible={catSheet} onClose={() => setCatSheet(false)} title="Kelola Kategori" testID="category-sheet">
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <Field testID="category-name-input" label="Kategori baru" value={catName} onChangeText={setCatName} placeholder="Contoh: Dessert" style={{ flex: 1 }} />
          <GradientButton testID="category-add-button" title="Tambah" small disabled={!catName.trim()} loading={addCat.isPending} onPress={() => addCat.mutate()} style={{ marginBottom: space.md }} />
        </View>
        {(cats.data ?? []).map((c) => (
          <View key={c.id} style={s.catRow}>
            <Text style={[s.name, { flex: 1 }]}>{c.name}</Text>
            <Text style={s.cat}>{menu.data?.filter((m) => m.category_id === c.id).length} menu</Text>
            <IconButton testID={`category-delete-${c.id}`} icon="trash-outline" color={colors.error} size={38} onPress={() => delCat.mutate(c.id)} />
          </View>
        ))}
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, overflow: "hidden" },
  img: { width: "100%", aspectRatio: 1.2, backgroundColor: colors.surfaceTertiary },
  badge: { position: "absolute", top: space.sm, left: space.sm, backgroundColor: colors.error, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: colors.onError, fontSize: 11, fontWeight: "700" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 14, fontFamily: fonts.text },
  cat: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  price: { color: colors.brandSecondary, fontWeight: "800", fontSize: 14 },
  photo: { height: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginBottom: space.lg, borderWidth: 1.5, borderColor: colors.brandPrimary, borderStyle: "dashed" },
  photoOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.35)" },
  photoText: { color: colors.onSurface, fontWeight: "700", fontFamily: fonts.text },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", fontFamily: fonts.text },
  catRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
});
