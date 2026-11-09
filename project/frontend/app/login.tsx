import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { homeFor, useAuth } from "@/src/auth";
import { colors, fonts, radius, space } from "@/src/theme";
import { Field, GradientButton, IconButton, Ionicons } from "@/src/ui";

const BG = "https://images.unsplash.com/photo-1745066113904-e8449839197b?w=1400&q=70";

export default function Login() {
  const { me, ready, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const glow = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.07 + glow.value * 0.07, transform: [{ scale: 1 + glow.value * 0.15 }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  if (ready && me) return <Redirect href={homeFor(me.user.role)} />;

  const submit = async () => {
    setErr("");
    if (!email.trim() || !password) {
      setErr("Email dan password wajib diisi");
      return;
    }
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      router.replace(homeFor(u.role));
    } catch (e: any) {
      setErr(e.message);
      shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" transition={600} />
      <LinearGradient colors={["rgba(13,13,13,0.55)", "rgba(13,13,13,0.92)", colors.surface]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[s.glow, glowStyle]} pointerEvents="none" />
      <KeyboardAwareScrollView
        bottomOffset={40}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }]}
      >
        <View style={s.inner}>
          <Animated.View entering={FadeInDown.duration(700)} style={s.iconWrap}>
            <LinearGradient colors={[colors.brandPrimary, colors.brandDeep]} style={s.icon}>
              <Ionicons name="restaurant" size={30} color={colors.onBrandPrimary} />
            </LinearGradient>
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(120).duration(700)} style={s.hi}>
            Selamat datang kembali 👋
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220).duration(700)} style={s.h1}>
            Good Food{"\n"}Good <Text style={{ color: colors.brandPrimary }}>Mood!</Text>
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(320).duration(700)} style={s.sub}>
            Masuk untuk Founder, Admin, Kasir & Dapur
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(400).duration(320)} style={[s.card, shakeStyle]}>
            <Field
              testID="login-email-input"
              label="Email"
              icon="mail-outline"
              placeholder="nama@resto.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
            <View>
              <Field
                testID="login-password-input"
                label="Password"
                icon="lock-closed-outline"
                placeholder="••••••••"
                secureTextEntry={!show}
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <View style={s.eye}>
                <IconButton testID="login-toggle-password" icon={show ? "eye-off-outline" : "eye-outline"} size={36} onPress={() => setShow(!show)} />
              </View>
            </View>
            {err ? (
              <Animated.View entering={FadeInDown} style={s.err} testID="login-error">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={s.errText}>{err}</Text>
              </Animated.View>
            ) : null}
            <GradientButton testID="login-submit-button" title="Masuk" icon="arrow-forward" loading={loading} onPress={submit} style={{ marginTop: space.sm }} />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(700)} style={s.brand} testID="login-devrion-brand">
          <View style={s.brandLogo}>
            <Image source={require("../assets/images/devrion-logo.png")} style={{ width: 92, height: 31 }} contentFit="contain" />
          </View>
          <Text style={s.brandText}>Powered by Devrion · Custom Apps, Built for Growth</Text>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  glow: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: colors.brandPrimary, top: -140, right: -140 },
  scroll: { flexGrow: 1, paddingHorizontal: space.xl, justifyContent: "space-between" },
  inner: { width: "100%", maxWidth: 440, alignSelf: "center" },
  iconWrap: { marginBottom: space.xl },
  icon: { width: 64, height: 64, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  hi: { color: colors.onSurfaceTertiary, fontSize: 15, fontFamily: fonts.text },
  h1: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "800", fontSize: 44, lineHeight: 48, marginTop: space.sm, letterSpacing: -1 },
  sub: { color: colors.muted, fontSize: 14, marginTop: space.md, fontFamily: fonts.text },
  card: { marginTop: space.xl, backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radius.xl, padding: space.xl },
  eye: { position: "absolute", right: 6, top: 25 },
  err: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.sm },
  errText: { color: colors.error, fontSize: 13, fontFamily: fonts.text, flex: 1 },
  brand: { alignItems: "center", gap: 6, marginTop: space.xxl, opacity: 0.7 },
  brandLogo: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  brandText: { color: colors.muted, fontSize: 10, fontFamily: fonts.text, letterSpacing: 0.3 },
});
