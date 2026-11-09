import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { api, rp } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { Shell } from "@/src/shell";
import { colors, fonts, radius, space } from "@/src/theme";
import { Chip, ChipRow, Empty, FadeInItem, Field, GradientButton, IconButton, Ionicons, Loading, Sheet, useToast } from "@/src/ui";

type Expense = { id: string; title: string; amount: number; category: string; date: string; outlet_id?: string };
const CATS = ["Bahan Baku", "Gaji", "Sewa", "Listrik & Air", "Operasional", "Marketing", "Lainnya"];
const PERIODS = [7, 30, 90];

export default function Expenses() {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [form, setForm] = useState<{ title: string; amount: string; category: string } | null>(null);
  const q = useQuery({ queryKey: ["expenses", days], queryFn: () => api<Expense[]>(`/expenses?days=${days}`) });
  const total = (q.data ?? []).reduce((a, e) => a + e.amount, 0);
  const inval = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["orders", "report"] });
  };
  const add = useMutation({
    mutationFn: () => api("/expenses", { method: "POST", body: { title: form!.title.trim(), amount: Number(form!.amount) || 0, category: form!.category } }),
    onSuccess: () => {
      inval();
      setForm(null);
      toast("Pengeluaran dicatat");
    },
    onError: (e: any) => toast(e.message, "err"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      inval();
      toast("Pengeluaran dihapus");
    },
  });

  return (
    <Shell
      title="Pengeluaran"
      subtitle="Catat biaya operasional resto"
      roles={["admin"]}
      right={<IconButton testID="expense-add-button" icon="add" onPress={() => setForm({ title: "", amount: "", category: CATS[0] })} />}
    >
      <View style={{ paddingHorizontal: space.lg }}>
        <ChipRow>
          {PERIODS.map((p) => (
            <Chip key={p} testID={`expense-period-${p}`} label={`${p} Hari`} active={days === p} onPress={() => setDays(p)} />
          ))}
        </ChipRow>
        <View style={s.total}>
          <Text style={s.totalLabel}>Total {days} hari terakhir</Text>
          <Text style={s.totalValue} testID="expense-total">{rp(total)}</Text>
        </View>
      </View>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}
          ListEmptyComponent={<Empty icon="wallet-outline" title="Belum ada pengeluaran" subtitle="Tap + untuk mencatat" />}
          renderItem={({ item, index }) => (
            <FadeInItem index={index}>
              <View style={s.row} testID={`expense-row-${item.id}`}>
                <View style={s.icon}>
                  <Ionicons name="arrow-down" size={18} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.title}</Text>
                  <Text style={s.sub}>
                    {item.category} · {new Date(item.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={s.amount}>-{rp(item.amount)}</Text>
                <IconButton testID={`expense-delete-${item.id}`} icon="trash-outline" color={colors.muted} size={36} onPress={() => del.mutate(item.id)} />
              </View>
            </FadeInItem>
          )}
        />
      )}
      <Sheet
        visible={!!form}
        onClose={() => setForm(null)}
        title="Catat Pengeluaran"
        testID="expense-form-sheet"
        footer={
          <GradientButton
            testID="expense-save-button"
            title="Simpan"
            icon="checkmark"
            loading={add.isPending}
            disabled={!form?.title.trim() || !Number(form?.amount)}
            onPress={() => add.mutate()}
          />
        }
      >
        {form && (
          <View>
            <Field testID="expense-title-input" label="Keterangan" value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} placeholder="Contoh: Beli sayur" />
            <Field
              testID="expense-amount-input"
              label="Jumlah (Rp)"
              keyboardType="number-pad"
              value={form.amount}
              onChangeText={(t) => setForm({ ...form, amount: t.replace(/\D/g, "") })}
              placeholder="150000"
            />
            <Text style={s.label}>Kategori</Text>
            <ChipRow>
              {CATS.map((c) => (
                <Chip key={c} testID={`expense-cat-${c.replace(/\W/g, "").toLowerCase()}`} label={c} active={form.category === c} onPress={() => setForm({ ...form, category: c })} />
              ))}
            </ChipRow>
          </View>
        )}
      </Sheet>
    </Shell>
  );
}

const s = StyleSheet.create({
  total: { backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.lg },
  totalLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.text },
  totalValue: { color: colors.error, fontSize: 26, fontWeight: "800", fontFamily: fonts.display, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.glassBorder, padding: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.error + "22", alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 14, fontFamily: fonts.text },
  sub: { color: colors.muted, fontSize: 12, fontFamily: fonts.text, marginTop: 2 },
  amount: { color: colors.error, fontWeight: "800", fontSize: 14, fontFamily: fonts.text },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", fontFamily: fonts.text },
});
