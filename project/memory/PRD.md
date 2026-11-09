# PRD — Resto POS (Cafe & Resto multi-tenant, by Devrion)

## Original problem statement (summary)
Mobile app (Expo, responsive desktop) for Cafe & Resto, dark-orange glass theme from reference image. One login for 4 roles: Founder, Admin, Kasir, Dapur. Customers tap NFC / scan QR per table → no-login menu page in browser → order lands real-time on kasir dashboard → kasir sends to dapur → dapur updates status by drag & drop (Baru → Dimasak → Siap → Disajikan). Founder manages multiple restaurants on one server without seeing their revenue. Admin: POS, full revenue/expense reports, kasir/dapur accounts per outlet, table QR/NFC links, menu + categories + photo upload, settings (logo, name, QRIS on/off + image, bank accounts). Customer: success animation + receipt, pay at cashier or pay now (QRIS / bank) with payment-proof upload. Secrets only in .env. Devrion branding only (small) on login page.

## User choices
- Menu opens in customer's phone browser (no app install)
- Pay-now confirmation: customer uploads payment proof
- Kitchen stages: Baru → Dimasak → Siap → Disajikan
- Kasir & Dapur bound to one outlet
- Desktop responsive

## Architecture
- Backend FastAPI (`/app/backend/server.py`), MongoDB (motor, pooled), JWT (bcrypt), login brute-force lock (Mongo TTL), per-IP throttle on public order endpoints, GZip, security headers, WebSocket hub `/api/ws` for real-time + 10s polling fallback, object storage helper `storage.py` (key `DEVRION_STORAGE_KEY` in .env), QR PNG generation `/api/qr/{code}.png`.
- Customer web page: `/app/backend/customer_page.html` served at `/api/m/{table_code}` (vanilla JS, CSS animations, confetti, receipt, live status tracking, proof upload).
- Frontend Expo Router: login, founder, dashboard, pos, orders, kitchen, menu, tables, staff, expenses, settings. `src/shell.tsx` (sidebar ≥900px, bottom bar on mobile), `src/ui.tsx` (animated components, sheet, toast), `src/live.tsx` (WebSocket bridge).

## Implemented (2026-06)
- All above features; seed: founder + demo resto "Kopi Senja" (see /app/memory/test_credentials.md)
- Tenant isolation & outlet ownership checks; dapur moves one stage at a time
- Tests: iteration 1 & 2 passed (28 backend tests in /app/backend/tests)

## Backlog
- P1: Printable QR sheet per table (PDF), thermal printer receipt
- P1: Status transition rules for admin/kasir, order cancellation reasons
- P2: Multi-worker realtime via Redis pub/sub (current hub is in-process, single worker)
- P2: Promo / discount banners on customer menu, item options (size, extra)
- P2: Founder delete/archive restaurant
