import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Linking, Text, View } from "react-native";

import { API, getToken } from "@/src/api";
import { colors, fonts, space } from "@/src/theme";
import { GhostButton, GradientButton, Sheet, useToast } from "@/src/ui";
import { uploadForm } from "@/src/utils/upload";

type Kind = "menu" | "logo" | "qris";

/** Image picker + upload with full permission handling (granted / denied / blocked). */
export function useImageUpload(kind: Kind, onDone: (path: string) => void) {
  const toast = useToast();
  const [explain, setExplain] = useState<"ask" | "blocked" | null>(null);

  const up = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const res = await uploadForm(`${API}/upload`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        fields: { kind },
        files: { file: { uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" } },
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.detail ?? "Gagal mengunggah gambar");
      return j.path as string;
    },
    onSuccess: (p) => {
      onDone(p);
      toast("Gambar berhasil diunggah");
    },
    onError: (e: any) => toast(e.message, "err"),
  });

  const launch = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "menu" ? [1, 1] : undefined,
      quality: 0.7,
    });
    if (!r.canceled && r.assets[0]) up.mutate(r.assets[0]);
  };

  const pick = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.granted || perm.accessPrivileges === "limited") return launch();
    setExplain(perm.canAskAgain ? "ask" : "blocked");
  };

  const request = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.granted || perm.accessPrivileges === "limited") {
      setExplain(null);
      launch();
    } else setExplain(perm.canAskAgain ? "ask" : "blocked");
  };

  const sheet = (
    <Sheet visible={!!explain} onClose={() => setExplain(null)} title="Akses Galeri Foto" testID="photo-permission-sheet">
      <Text style={{ color: colors.onSurfaceTertiary, fontFamily: fonts.text, fontSize: 14, lineHeight: 21, marginBottom: space.lg }}>
        {explain === "blocked"
          ? "Akses galeri ditolak. Buka Pengaturan HP untuk mengizinkan akses foto agar bisa mengunggah gambar."
          : "Izinkan akses galeri untuk memilih foto menu, logo, atau QRIS resto kamu."}
      </Text>
      <View style={{ gap: space.sm }}>
        {explain === "blocked" ? (
          <GradientButton testID="photo-permission-open-settings" title="Buka Pengaturan" icon="settings" onPress={() => Linking.openSettings()} />
        ) : (
          <GradientButton testID="photo-permission-allow" title="Izinkan Akses" icon="images" onPress={request} />
        )}
        <GhostButton testID="photo-permission-cancel" title="Nanti saja" onPress={() => setExplain(null)} />
      </View>
    </Sheet>
  );

  return { pick, uploading: up.isPending, sheet };
}
