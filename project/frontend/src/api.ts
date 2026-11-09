import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

// Web app is served by the backend itself, so it always talks to its own origin.
export const BACKEND_URL =
  Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : (process.env.EXPO_PUBLIC_BACKEND_URL as string);
export const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "auth_token";

let memToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken() {
  memToken = (await storage.secureGet(TOKEN_KEY, null)) as string | null;
  return memToken;
}
export async function setToken(t: string | null) {
  memToken = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}
export const getToken = () => memToken;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

function detail(j: any, fallback: string): string {
  if (!j) return fallback;
  if (typeof j.detail === "string") return j.detail;
  if (Array.isArray(j.detail)) return "Data belum lengkap / tidak valid";
  return fallback;
}

export async function api<T = any>(path: string, init: { method?: string; body?: any } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const sentToken = memToken;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi internet.", 0);
  }
  let j: any = null;
  try {
    j = await r.json();
  } catch {}
  if (!r.ok) {
    if (r.status === 401 && sentToken && sentToken === memToken && onUnauthorized) onUnauthorized();
    throw new ApiError(detail(j, "Terjadi kesalahan"), r.status);
  }
  return j as T;
}

export const fileUrl = (path?: string | null, priv = false) =>
  path ? `${API}/files/${path}${priv && memToken ? `?token=${memToken}` : ""}` : undefined;

export const menuImage = (m: { image_path?: string | null; image_url?: string | null }) =>
  m.image_path ? fileUrl(m.image_path) : m.image_url || undefined;

export const rp = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
