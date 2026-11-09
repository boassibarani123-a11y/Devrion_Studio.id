// Design tokens — dark glassmorphism with warm orange glow (from /app/design_guidelines.json).
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0D0D0D",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#F2F2F2",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#E5E5E5",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0D0D0D",
  muted: "#8C8C8C",

  brand: "#FF6B00",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF7A00",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFA34D",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#331800",
  onBrandTertiary: "#FFD6B3",
  brandDeep: "#D65F00",

  success: "#00C853",
  onSuccess: "#FFFFFF",
  warning: "#FFD600",
  onWarning: "#1A1A1A",
  error: "#FF3D00",
  onError: "#FFFFFF",
  info: "#29B6F6",
  onInfo: "#FFFFFF",

  border: "#262626",
  borderStrong: "#404040",
  divider: "#1A1A1A",

  glass: "rgba(26,26,26,0.78)",
  glassBorder: "rgba(255,255,255,0.08)",
  scrim: "rgba(0,0,0,0.65)",
  glow: "rgba(255,122,0,0.35)",
  receipt: "#F7F3EE",
  onReceipt: "#1A1A1A",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.("dark");

export const colors = dark;

export const fonts = { display: "SpaceGrotesk", text: "Geist" };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, xl: 24, pill: 999 };

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  useColorScheme();
  return { scheme: "dark", colors: dark };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
