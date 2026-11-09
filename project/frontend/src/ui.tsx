import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, space } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export { Ionicons };

export const tap = () => {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function useWide() {
  const { width } = useWindowDimensions();
  return width >= 900;
}

/* ---------- Pressable with spring scale ---------- */
export function PressScale({
  children,
  onPress,
  style,
  disabled,
  testID,
  scaleTo = 0.98,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
  scaleTo?: number;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      testID={testID}
      disabled={disabled}
      onPressIn={() => (s.value = withTiming(scaleTo, { duration: 220 }))}
      onPressOut={() => (s.value = withTiming(1, { duration: 220 }))}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[style, a, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ---------- Buttons ---------- */
export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
  testID,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return (
    <PressScale testID={testID} onPress={onPress} disabled={disabled || loading} style={[styles.btnShadow, style]}>
      <LinearGradient
        colors={[colors.brandPrimary, colors.brandDeep]}
        style={[styles.btn, small && { height: 44, paddingHorizontal: space.lg }]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onBrandPrimary} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={colors.onBrandPrimary} /> : null}
            <Text numberOfLines={1} style={[styles.btnText, small && { fontSize: 13 }]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </PressScale>
  );
}

export function GhostButton({
  title,
  onPress,
  icon,
  testID,
  danger,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  testID?: string;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = danger ? colors.error : colors.onSurface;
  return (
    <PressScale testID={testID} onPress={onPress} style={[styles.ghost, small && { height: 44, paddingHorizontal: space.md }, style]}>
      {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={c} /> : null}
      <Text numberOfLines={1} style={[styles.ghostText, { color: c }, small && { fontSize: 13 }]}>{title}</Text>
    </PressScale>
  );
}

export function IconButton({ icon, onPress, testID, color, size = 44 }: { icon: IconName; onPress?: () => void; testID?: string; color?: string; size?: number }) {
  return (
    <PressScale testID={testID} onPress={onPress} style={[styles.iconBtn, { width: size, height: size }]}>
      <Ionicons name={icon} size={20} color={color ?? colors.onSurface} />
    </PressScale>
  );
}

/* ---------- Surfaces ---------- */
export function Glass({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[styles.glass, style]}>
      {children}
    </View>
  );
}

export function FadeInItem({ children, index = 0, style }: { children: React.ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 45).duration(320)} style={style}>
      {children}
    </Animated.View>
  );
}

export function Title({ children, accent, style }: { children: string; accent?: string; style?: any }) {
  return (
    <Text style={[styles.title, style]}>
      {children}
      {accent ? <Text style={{ color: colors.brandPrimary }}> {accent}</Text> : null}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Badge({ label, color, testID }: { label: string; color: string; testID?: string }) {
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.brandPrimary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </Animated.View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

/* ---------- Inputs ---------- */
export function Field({ label, icon, style, ...p }: TextInputProps & { label?: string; icon?: IconName }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ marginBottom: space.md }, style as any]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.input, focus && { borderColor: colors.brandPrimary }]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.muted} /> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          {...p}
          onFocus={(e) => {
            setFocus(true);
            p.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            p.onBlur?.(e);
          }}
          style={styles.inputText}
        />
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress, testID, icon }: { label: string; active?: boolean; onPress?: () => void; testID?: string; icon?: IconName }) {
  return (
    <PressScale testID={testID} onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      {icon ? <Ionicons name={icon} size={15} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} /> : null}
      <Text style={[styles.chipText, active && { color: colors.onBrandPrimary }]}>{label}</Text>
    </PressScale>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
      {children}
    </ScrollView>
  );
}

/* ---------- Bottom sheet / centered dialog ---------- */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? (
        <View style={[styles.sheetWrap, wide && { justifyContent: "center", alignItems: "center" }]}>
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
            <Pressable testID={testID ? `${testID}-backdrop` : undefined} style={styles.scrim} onPress={onClose} />
          </Animated.View>
          <Animated.View
            testID={testID}
            entering={SlideInDown.duration(320)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheet, wide ? styles.dialog : { paddingBottom: insets.bottom + space.lg }]}
          >
            {!wide && <View style={styles.handle} />}
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <IconButton testID={testID ? `${testID}-close` : "sheet-close"} icon="close" onPress={onClose} size={38} />
            </View>
            <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }}>
              {children}
            </KeyboardAwareScrollView>
            {footer ? <View style={{ paddingTop: space.sm }}>{footer}</View> : null}
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

/* ---------- Toast ---------- */
type ToastT = { id: number; text: string; kind: "ok" | "err" | "info" };
const ToastCtx = createContext<(text: string, kind?: ToastT["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastT | null>(null);
  const timer = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string, kind: ToastT["kind"] = "ok") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, kind });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  const icon: IconName = toast?.kind === "err" ? "alert-circle" : toast?.kind === "info" ? "notifications" : "checkmark-circle";
  const c = toast?.kind === "err" ? colors.error : toast?.kind === "info" ? colors.brandPrimary : colors.success;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(320)}
          exiting={FadeOut}
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + space.md }]}
          testID="app-toast"
        >
          <Ionicons name={icon} size={20} color={c} />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function Switch({ value, onChange, testID }: { value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 220 }) }] }), [value]);
  return (
    <Pressable testID={testID} onPress={() => { tap(); onChange(!value); }} style={[styles.sw, value && { backgroundColor: colors.brandPrimary }]}>
      <Animated.View style={[styles.knob, a]} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  btnShadow: {
    borderRadius: radius.lg,
    shadowColor: colors.brandPrimary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  btn: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.sm, paddingHorizontal: space.xl },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.text, fontWeight: "700", fontSize: 15 },
  ghost: {
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  ghostText: { fontFamily: fonts.text, fontWeight: "600", fontSize: 14 },
  iconBtn: { borderRadius: radius.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, alignItems: "center", justifyContent: "center" },
  glass: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg },
  title: { fontFamily: fonts.display, fontWeight: "800", fontSize: 28, color: colors.onSurface, letterSpacing: -0.5 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xl, marginBottom: space.md },
  section: { fontFamily: fonts.display, fontWeight: "700", fontSize: 18, color: colors.onSurface },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700", fontFamily: fonts.text },
  empty: { alignItems: "center", padding: space.xxxl, gap: space.sm },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", fontFamily: fonts.text, textAlign: "center" },
  emptySub: { color: colors.muted, fontSize: 13, textAlign: "center", fontFamily: fonts.text },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxxl },
  label: { color: colors.muted, fontSize: 12, marginBottom: 6, fontFamily: fonts.text, fontWeight: "600" },
  input: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  inputText: { flex: 1, color: colors.onSurface, fontSize: 15, fontFamily: fonts.text, height: "100%", outlineStyle: "none" } as any,
  chipRow: { flexGrow: 0, height: 56 },
  chipRowContent: { gap: space.sm, alignItems: "center", paddingRight: space.lg },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600", fontFamily: fonts.text },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    maxHeight: "92%",
  },
  dialog: { width: 560, maxWidth: "94%", borderRadius: radius.xl, paddingBottom: space.xl, paddingTop: space.lg, maxHeight: "88%" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: space.md },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, fontWeight: "800", color: colors.onSurface, flex: 1 },
  toast: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: 480,
    marginHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surfaceTertiary,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  toastText: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.text, fontWeight: "600", flexShrink: 1 },
  sw: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.borderStrong, padding: 3, justifyContent: "center" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.onSurface },
});
