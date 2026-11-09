import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { homeFor, useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Index() {
  const { me, ready } = useAuth();
  if (!ready)
    return (
      <View style={styles.c}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  return <Redirect href={me ? homeFor(me.user.role) : "/login"} />;
}

const styles = StyleSheet.create({ c: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" } });
