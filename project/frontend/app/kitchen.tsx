import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInDown, LinearTransition, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { api } from "@/src/api";
import { Order, STATUS, timeAgo } from "@/src/orders";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Ionicons, Loading, PressScale, useToast, useWide } from "@/src/ui";

const COLS = ["baru", "dimasak", "siap", "disajikan"] as const;
type Col = (typeof COLS)[number];
const PAD = space.lg;
const GAP = space.md;
const NEXT_LABEL: Record<Col, string> = { baru: "Mulai Masak", dimasak: "Tandai Siap", siap: "Sajikan", disajikan: "" };
const KEY = ["orders", "kitchen"];

export default function Kitchen() {
  const toast = useToast();
  const wide = useWide();
  const q = useQuery({ queryKey: KEY, queryFn: () => api<Order[]>("/orders?scope=kitchen&limit=300"), refetchInterval: 10000 });
  const [boardW, setBoardW] = useState(0);
  const [drag, setDrag] = useState<{ id: string; w: number } | null>(null);
  const boardRef = useRef<any>(null);
  const boardX = useSharedValue(0);
  const boardY = useSharedValue(0);
  const scrollX = useSharedValue(0);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const hover = useSharedValue(-1);
  const colWsv = useSharedValue(280);

  const colW = wide && boardW ? Math.max(240, (boardW - PAD * 2 - GAP * 3) / 4) : 280;
  colWsv.value = colW;

  const move = useMutation({
    mutationFn: ({ id, st }: { id: string; st: Col }) => api<Order>(`/orders/${id}/status`, { method: "PATCH", body: { status: st } }),
    onMutate: ({ id, st }) => {
      queryClient.setQueryData<Order[]>(KEY, (old) => old?.map((o) => (o.id === id ? { ...o, status: st } : o)));
    },
    onSuccess: (_o, v) => toast(`Status → ${STATUS[v.st].label}`),
    onError: (e: any) => toast(e.message, "err"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const grouped = useMemo(() => {
    const g: Record<Col, Order[]> = { baru: [], dimasak: [], siap: [], disajikan: [] };
    (q.data ?? []).forEach((o) => g[o.status as Col]?.push(o));
    COLS.forEach((c) => g[c].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    g.disajikan.reverse();
    return g;
  }, [q.data]);

  const measure = useCallback(() => {
    boardRef.current?.measureInWindow((x: number, y: number) => {
      boardX.value = x;
      boardY.value = y;
    });
  }, [boardX, boardY]);

  const onLayout = (e: LayoutChangeEvent) => {
    setBoardW(e.nativeEvent.layout.width);
    measure();
  };

  const startDrag = useCallback((id: string, w: number) => {
    measure();
    setDrag({ id, w });
  }, [measure]);
  const endDrag = useCallback(() => setDrag(null), []);
  const drop = useCallback(
    (id: string, idx: number) => {
      const o = q.data?.find((x) => x.id === id);
      const st = COLS[idx];
      if (o && st && o.status !== st) move.mutate({ id, st });
    },
    [q.data, move],
  );

  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateX: gx.value }, { translateY: gy.value }, { rotate: "-3deg" }, { scale: 1.04 }] }));
  const dragged = drag ? q.data?.find((o) => o.id === drag.id) : undefined;

  return (
    <Shell title="Dapur" subtitle="Tahan & geser kartu untuk mengubah status" roles={["admin", "dapur"]}>
      {q.isLoading ? (
        <Loading />
      ) : (
        <View ref={boardRef} style={{ flex: 1 }} onLayout={onLayout} testID="kitchen-board">
          <ScrollView
            horizontal
            scrollEnabled={!drag}
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => (scrollX.value = e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP, paddingBottom: space.lg }}
          >
            {COLS.map((c, idx) => (
              <Column key={c} col={c} idx={idx} width={colW} hover={hover} count={grouped[c].length}>
                {grouped[c].length === 0 ? (
                  <Text style={s.colEmpty}>{c === "baru" ? "Belum ada pesanan baru" : "Kosong"}</Text>
                ) : (
                  grouped[c].map((o, i) => (
                    <Ticket
                      key={o.id}
                      o={o}
                      index={i}
                      hidden={drag?.id === o.id}
                      gx={gx}
                      gy={gy}
                      hover={hover}
                      boardX={boardX}
                      boardY={boardY}
                      scrollX={scrollX}
                      colW={colWsv}
                      onStart={startDrag}
                      onDrop={drop}
                      onEnd={endDrag}
                      onAdvance={(st) => move.mutate({ id: o.id, st })}
                    />
                  ))
                )}
              </Column>
            ))}
          </ScrollView>
          {dragged && drag ? (
            <Animated.View pointerEvents="none" style={[s.ghost, { width: drag.w }, ghostStyle]}>
              <TicketBody o={dragged} />
            </Animated.View>
          ) : null}
        </View>
      )}
    </Shell>
  );
}

function Column({ col, idx, width, hover, count, children }: { col: Col; idx: number; width: number; hover: SharedValue<number>; count: number; children: React.ReactNode }) {
  const st = STATUS[col];
  const a = useAnimatedStyle(() => ({
    borderColor: hover.value === idx ? st.color : colors.glassBorder,
    backgroundColor: hover.value === idx ? st.color + "14" : colors.glass,
  }));
  return (
    <Animated.View style={[s.col, { width }, a]} testID={`kitchen-col-${col}`}>
      <View style={s.colHead}>
        <View style={[s.colDot, { backgroundColor: st.color }]} />
        <Text style={s.colTitle}>{st.label}</Text>
        <View style={s.count}>
          <Text style={s.countText} testID={`kitchen-count-${col}`}>{count}</Text>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

type TicketProps = {
  o: Order;
  index: number;
  hidden: boolean;
  gx: SharedValue<number>;
  gy: SharedValue<number>;
  hover: SharedValue<number>;
  boardX: SharedValue<number>;
  boardY: SharedValue<number>;
  scrollX: SharedValue<number>;
  colW: SharedValue<number>;
  onStart: (id: string, w: number) => void;
  onDrop: (id: string, idx: number) => void;
  onEnd: () => void;
  onAdvance: (st: Col) => void;
};

function Ticket({ o, index, hidden, gx, gy, hover, boardX, boardY, scrollX, colW, onStart, onDrop, onEnd, onAdvance }: TicketProps) {
  const w = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const lift = useSharedValue(1);
  const id = o.id;
  const gesture = useMemo(() => {
    const colAt = (absX: number) => {
      "worklet";
      const x = absX - boardX.value + scrollX.value - PAD;
      const i = Math.floor(x / (colW.value + GAP));
      return Math.max(0, Math.min(3, i));
    };
    let g = Gesture.Pan();
    g = Platform.OS === "web" ? g.minDistance(6) : g.activateAfterLongPress(220);
    return g
      .onStart((e) => {
        lift.value = withTiming(0.95, { duration: 220 });
        sx.value = e.absoluteX - boardX.value - e.x - e.translationX;
        sy.value = e.absoluteY - boardY.value - e.y - e.translationY;
        gx.value = sx.value + e.translationX;
        gy.value = sy.value + e.translationY;
        hover.value = colAt(e.absoluteX);
        scheduleOnRN(onStart, id, w.value);
      })
      .onUpdate((e) => {
        gx.value = sx.value + e.translationX;
        gy.value = sy.value + e.translationY;
        hover.value = colAt(e.absoluteX);
      })
      .onEnd((e) => {
        scheduleOnRN(onDrop, id, colAt(e.absoluteX));
      })
      .onFinalize(() => {
        lift.value = withTiming(1, { duration: 220 });
        hover.value = -1;
        scheduleOnRN(onEnd);
      });
  }, [id, gx, gy, sx, sy, hover, boardX, boardY, scrollX, colW, lift, w, onStart, onDrop, onEnd]);

  const a = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  const idx = COLS.indexOf(o.status as Col);
  const next = COLS[idx + 1];

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(320)} layout={LinearTransition.duration(320)}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          testID={`kitchen-ticket-${o.id}`}
          onLayout={(e) => (w.value = e.nativeEvent.layout.width)}
          style={[a, { opacity: hidden ? 0.25 : 1 }]}
        >
          <TicketBody o={o} />
        </Animated.View>
      </GestureDetector>
      <View style={s.ticketActions}>
        {idx > 0 && o.status !== "disajikan" && (
          <PressScale testID={`kitchen-back-${o.id}`} onPress={() => onAdvance(COLS[idx - 1])} style={s.backBtn}>
            <Ionicons name="arrow-back" size={16} color={colors.muted} />
          </PressScale>
        )}
        {next && (
          <PressScale testID={`kitchen-next-${o.id}`} onPress={() => onAdvance(next)} style={[s.nextBtn, { backgroundColor: STATUS[next].color + "22", borderColor: STATUS[next].color + "66" }]}>
            <Text style={[s.nextText, { color: STATUS[next].color }]}>{NEXT_LABEL[o.status as Col]}</Text>
            <Ionicons name="arrow-forward" size={14} color={STATUS[next].color} />
          </PressScale>
        )}
      </View>
    </Animated.View>
  );
}

function TicketBody({ o }: { o: Order }) {
  const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
  const late = mins >= 15 && o.status !== "disajikan";
  return (
    <View style={[s.ticket, late && { borderColor: colors.error }]}>
      <View style={s.tHead}>
        <Text style={s.tTable}>{o.table_name}</Text>
        <View style={[s.timer, late && { backgroundColor: colors.error + "22" }]}>
          <Ionicons name="time-outline" size={12} color={late ? colors.error : colors.muted} />
          <Text style={[s.timerText, late && { color: colors.error }]}>{timeAgo(o.created_at)}</Text>
        </View>
      </View>
      <Text style={s.tMeta}>
        {o.number} · {o.customer_name}
      </Text>
      <View style={s.tItems}>
        {o.items.map((i) => (
          <View key={i.menu_id}>
            <Text style={s.tItem}>
              <Text style={{ color: colors.brandPrimary, fontWeight: "800" }}>{i.qty}× </Text>
              {i.name}
            </Text>
            {i.note ? <Text style={s.tNote}>↳ {i.note}</Text> : null}
          </View>
        ))}
      </View>
      {o.note ? <Text style={s.tNote}>Catatan: {o.note}</Text> : null}
      <View style={s.grip}>
        <Ionicons name="reorder-two" size={18} color={colors.borderStrong} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  col: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.md, flex: 1 },
  colHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "700", fontSize: 16, flex: 1 },
  count: { minWidth: 28, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countText: { color: colors.onSurface, fontWeight: "800", fontSize: 12 },
  colEmpty: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: space.xl, fontFamily: fonts.text },
  ticket: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: space.md },
  tHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  tTable: { color: colors.onSurface, fontFamily: fonts.display, fontWeight: "800", fontSize: 17, flexShrink: 1 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  timerText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tMeta: { color: colors.muted, fontSize: 11, marginTop: 2, fontFamily: fonts.text },
  tItems: { marginTop: space.sm, gap: 4 },
  tItem: { color: colors.onSurface, fontSize: 14, fontFamily: fonts.text, fontWeight: "600" },
  tNote: { color: colors.warning, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  grip: { alignItems: "center", marginTop: 4 },
  ticketActions: { flexDirection: "row", gap: space.sm, marginTop: 6 },
  backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  nextBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  nextText: { fontSize: 12, fontWeight: "700", fontFamily: fonts.text },
  ghost: { position: "absolute", left: 0, top: 0, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 24, elevation: 20 },
});
