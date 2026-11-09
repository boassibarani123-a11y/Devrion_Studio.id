import os
# Cafe & Resto multi-tenant API regression tests (auth, founder, admin CRUD, public order flow, kitchen flow)
import io, os, time, uuid
import pytest, requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CREDS = {"founder": ("founder@devrion.id", os.environ["FOUNDER_PASSWORD"]), "admin": ("admin@kopisenja.id", "Admin123!"),
         "kasir": ("kasir@kopisenja.id", "Staff123!"), "dapur": ("dapur@kopisenja.id", "Staff123!")}
# 1x1 png
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def login(role):
    e, p = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": e, "password": p}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def tok():
    return {r: login(r)["token"] for r in CREDS}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---- Auth
class TestAuth:
    def test_login_all_roles_and_me(self, tok):
        for role in CREDS:
            r = requests.get(f"{API}/auth/me", headers=H(tok[role]))
            assert r.status_code == 200
            assert r.json()["user"]["role"] == role
            assert "password_hash" not in r.json()["user"]

    def test_role_guards(self, tok):
        assert requests.get(f"{API}/founder/restaurants", headers=H(tok["admin"])).status_code == 403
        assert requests.get(f"{API}/staff", headers=H(tok["kasir"])).status_code == 403
        assert requests.get(f"{API}/reports/summary", headers=H(tok["dapur"])).status_code == 403
        assert requests.get(f"{API}/menu", headers=H(tok["founder"])).status_code == 403
        assert requests.get(f"{API}/menu").status_code == 401

    def test_bruteforce_lock(self):
        email = f"test_bf_{uuid.uuid4().hex[:6]}@example.com"
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "x"}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5, codes
        assert codes[5] == 429, codes


# ---- Founder
class TestFounder:
    def test_list_no_revenue_and_create_deactivate(self, tok):
        r = requests.get(f"{API}/founder/restaurants", headers=H(tok["founder"]))
        assert r.status_code == 200 and isinstance(r.json(), list)
        txt = r.text.lower()
        assert "revenue" not in txt and "omzet" not in txt and "total" not in txt
        email = f"test_admin_{uuid.uuid4().hex[:6]}@example.com"
        c = requests.post(f"{API}/founder/restaurants", headers=H(tok["founder"]), json={
            "name": "TEST_Resto", "admin_email": email, "admin_password": "Test123!", "city": "Bandung"})
        assert c.status_code == 200, c.text
        rid = c.json()["id"]
        assert "revenue" not in c.text.lower()
        assert c.json()["stats"]["outlets"] == 1
        dup = requests.post(f"{API}/founder/restaurants", headers=H(tok["founder"]), json={
            "name": "TEST_Resto2", "admin_email": email, "admin_password": "Test123!"})
        assert dup.status_code == 409
        lg = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test123!"})
        assert lg.status_code == 200 and lg.json()["user"]["role"] == "admin"
        new_tok = lg.json()["token"]
        p = requests.patch(f"{API}/founder/restaurants/{rid}", headers=H(tok["founder"]), json={"active": False})
        assert p.status_code == 200 and p.json()["active"] is False
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "Test123!"}).status_code == 401
        assert requests.get(f"{API}/auth/me", headers=H(new_tok)).status_code == 401
        assert requests.patch(f"{API}/founder/restaurants/nonexistent", headers=H(tok["founder"]), json={"city": "x"}).status_code == 404


# ---- Admin CRUD
class TestAdminCrud:
    def test_categories_menu_crud(self, tok):
        h = H(tok["admin"])
        c = requests.post(f"{API}/categories", headers=h, json={"name": "TEST_Cat", "icon": "cafe"})
        assert c.status_code == 200
        cid = c.json()["id"]
        m = requests.post(f"{API}/menu", headers=h, json={"name": "TEST_Menu", "price": 12345, "category_id": cid})
        assert m.status_code == 200 and m.json()["price"] == 12345
        mid = m.json()["id"]
        assert any(x["id"] == mid for x in requests.get(f"{API}/menu", headers=h).json())
        u = requests.patch(f"{API}/menu/{mid}", headers=h, json={"name": "TEST_Menu2", "price": 15000, "category_id": cid})
        assert u.status_code == 200
        assert requests.patch(f"{API}/menu/{mid}/availability?available=false", headers=h).status_code == 200
        assert requests.delete(f"{API}/categories/{cid}", headers=h).status_code == 400
        assert requests.post(f"{API}/menu", headers=h, json={"name": "x", "price": 1, "category_id": "bad"}).status_code == 400
        assert requests.delete(f"{API}/menu/{mid}", headers=h).status_code == 200
        assert not any(x["id"] == mid for x in requests.get(f"{API}/menu", headers=h).json())
        assert requests.delete(f"{API}/categories/{cid}", headers=h).status_code == 200

    def test_outlets_tables_qr_staff(self, tok):
        h = H(tok["admin"])
        o = requests.post(f"{API}/outlets", headers=h, json={"name": "TEST_Outlet"})
        assert o.status_code == 200
        oid = o.json()["id"]
        t = requests.post(f"{API}/tables", headers=h, json={"name": "TEST_Meja", "outlet_id": oid})
        assert t.status_code == 200, t.text
        tb = t.json()
        assert "/api/m/" in tb["link"]
        q = requests.get(f"{API}/qr/{tb['code']}.png")
        assert q.status_code == 200 and q.headers["content-type"] == "image/png" and q.content[:4] == b"\x89PNG"
        assert requests.get(f"{API}/qr/doesnotexist.png").status_code == 404
        rg = requests.post(f"{API}/tables/{tb['id']}/regenerate", headers=h)
        assert rg.status_code == 200 and rg.json()["code"] != tb["code"]
        email = f"test_staff_{uuid.uuid4().hex[:6]}@example.com"
        s = requests.post(f"{API}/staff", headers=h, json={"name": "TEST_Staff", "email": email, "password": "Staff123!",
                                                           "role": "kasir", "outlet_id": oid})
        assert s.status_code == 200 and "password_hash" not in s.json()
        sid = s.json()["id"]
        assert requests.delete(f"{API}/outlets/{oid}", headers=h).status_code == 400
        lg = requests.post(f"{API}/auth/login", json={"email": email, "password": "Staff123!"})
        assert lg.status_code == 200 and lg.json()["user"]["outlet_id"] == oid
        assert requests.delete(f"{API}/staff/{sid}", headers=h).status_code == 200
        assert requests.delete(f"{API}/tables/{tb['id']}", headers=h).status_code == 200
        assert requests.delete(f"{API}/outlets/{oid}", headers=h).status_code == 200

    def test_regenerate_foreign_table_not_500(self, tok):
        r = requests.post(f"{API}/tables/nonexistent-id/regenerate", headers=H(tok["admin"]))
        assert r.status_code == 404, f"got {r.status_code}"

    def test_expenses_and_report(self, tok):
        h = H(tok["admin"])
        before = requests.get(f"{API}/reports/summary?days=7", headers=h).json()
        e = requests.post(f"{API}/expenses", headers=h, json={"title": "TEST_Gas", "amount": 1000, "category": "Bahan"})
        assert e.status_code == 200
        eid = e.json()["id"]
        assert any(x["id"] == eid for x in requests.get(f"{API}/expenses", headers=h).json())
        after = requests.get(f"{API}/reports/summary?days=7", headers=h).json()
        assert after["expense"] == before["expense"] + 1000
        assert len(after["series"]) == 7
        for k in ("revenue", "profit", "orders", "top_items", "methods"):
            assert k in after
        assert requests.delete(f"{API}/expenses/{eid}", headers=h).status_code == 200

    def test_settings_patch_and_upload(self, tok):
        h = H(tok["admin"])
        orig = requests.get(f"{API}/settings", headers=h).json()
        banks = orig.get("bank_accounts") or []
        new_banks = banks + [{"id": "test_bank_1", "bank": "BCA", "number": "123", "holder": "TEST", "enabled": True}]
        p = requests.patch(f"{API}/settings", headers=h, json={"bank_accounts": new_banks})
        assert p.status_code == 200, p.text
        assert any(b["id"] == "test_bank_1" for b in p.json()["bank_accounts"])
        p2 = requests.patch(f"{API}/settings", headers=h, json={"bank_accounts": banks, "qris_enabled": orig.get("qris_enabled", False)})
        assert p2.status_code == 200
        up = requests.post(f"{API}/upload", headers=h, data={"kind": "menu"}, files={"file": ("a.png", PNG, "image/png")})
        assert up.status_code == 200, up.text
        assert "path" in up.json()
        bad = requests.post(f"{API}/upload", headers=h, data={"kind": "menu"}, files={"file": ("a.txt", b"hi", "text/plain")})
        assert bad.status_code == 400


# ---- Public customer + order flow
class TestOrderFlow:
    def test_public_flow_and_kitchen(self, tok):
        pm = requests.get(f"{API}/public/menu/demo-meja-1")
        assert pm.status_code == 200
        d = pm.json()
        assert d["menu"] and d["table"]["name"]
        assert requests.get(f"{API}/public/menu/bad-code").status_code == 404
        mid = d["menu"][0]["id"]
        o = requests.post(f"{API}/public/orders", json={"code": "demo-meja-1", "customer_name": "TEST_Cust",
                                                        "items": [{"menu_id": mid, "qty": 2}], "payment_method": "kasir"})
        assert o.status_code == 200, o.text
        od = o.json()
        assert od["status"] == "pending" and od["total"] == d["menu"][0]["price"] * 2
        g = requests.get(f"{API}/public/orders/{od['id']}?t={od['token']}")
        assert g.status_code == 200 and g.json()["id"] == od["id"]
        assert requests.get(f"{API}/public/orders/{od['id']}?t=wrong").status_code == 404
        # proof upload
        pr = requests.post(f"{API}/public/orders/{od['id']}/proof", data={"t": od["token"]},
                           files={"file": ("p.png", PNG, "image/png")})
        assert pr.status_code == 200, pr.text
        assert pr.json()["payment_status"] == "verifying"
        # kasir sees it
        lst = requests.get(f"{API}/orders?scope=active", headers=H(tok["kasir"])).json()
        assert any(x["id"] == od["id"] for x in lst)
        assert all("public_token" not in x for x in lst)
        # dapur cannot accept pending
        assert requests.patch(f"{API}/orders/{od['id']}/status", headers=H(tok["dapur"]), json={"status": "baru"}).status_code == 403
        assert requests.patch(f"{API}/orders/{od['id']}/status", headers=H(tok["kasir"]), json={"status": "baru"}).json()["status"] == "baru"
        for st in ("dimasak", "siap", "disajikan"):
            r = requests.patch(f"{API}/orders/{od['id']}/status", headers=H(tok["dapur"]), json={"status": st})
            assert r.status_code == 200 and r.json()["status"] == st
        assert requests.patch(f"{API}/orders/{od['id']}/status", headers=H(tok["dapur"]), json={"status": "batal"}).status_code == 403
        assert requests.patch(f"{API}/orders/{od['id']}/status", headers=H(tok["dapur"]), json={"status": "pending"}).status_code == 403
        assert requests.patch(f"{API}/orders/{od['id']}/payment", headers=H(tok["dapur"]), json={"method": "cash"}).status_code == 403
        pay = requests.patch(f"{API}/orders/{od['id']}/payment", headers=H(tok["kasir"]), json={"method": "cash", "paid": True})
        assert pay.status_code == 200 and pay.json()["payment_status"] == "paid"
        assert requests.get(f"{API}/public/orders/{od['id']}?t={od['token']}").json()["status"] == "disajikan"

    def test_public_bank_qris_validation(self):
        d = requests.get(f"{API}/public/menu/demo-meja-2").json()
        mid = d["menu"][0]["id"]
        r = requests.post(f"{API}/public/orders", json={"code": "demo-meja-2", "items": [{"menu_id": mid, "qty": 1}],
                                                        "payment_method": "bank", "bank_id": "nope"})
        assert r.status_code == 400
        banks = d["payment"]["banks"]
        if banks:
            r = requests.post(f"{API}/public/orders", json={"code": "demo-meja-2", "customer_name": "TEST_Bank",
                                                            "items": [{"menu_id": mid, "qty": 1}], "payment_method": "bank",
                                                            "bank_id": banks[0]["id"]})
            assert r.status_code == 200 and r.json()["bank"]["id"] == banks[0]["id"]
            # cleanup: cancel the created order by its id
            kt = requests.post(f"{API}/auth/login", json={"email": "kasir@kopisenja.id", "password": "Staff123!"}).json()["token"]
            requests.patch(f"{API}/orders/{r.json()['id']}/status", headers=H(kt), json={"status": "batal"})
        if not d["payment"]["qris_enabled"]:
            r = requests.post(f"{API}/public/orders", json={"code": "demo-meja-2", "items": [{"menu_id": mid, "qty": 1}],
                                                            "payment_method": "qris"})
            assert r.status_code == 400
        assert requests.post(f"{API}/public/orders", json={"code": "demo-meja-2", "items": []}).status_code == 422

    def test_pos_order(self, tok):
        menu = requests.get(f"{API}/menu", headers=H(tok["kasir"])).json()
        mid = next(m["id"] for m in menu if m.get("available", True))
        r = requests.post(f"{API}/orders", headers=H(tok["kasir"]), json={"items": [{"menu_id": mid, "qty": 1}],
                                                                           "customer_name": "TEST_POS", "payment_method": "cash"})
        assert r.status_code == 200 and r.json()["status"] == "baru" and r.json()["payment_status"] == "paid"
        assert "public_token" not in r.json()
        k = requests.get(f"{API}/orders?scope=kitchen", headers=H(tok["dapur"])).json()
        assert any(x["id"] == r.json()["id"] for x in k)
        # cleanup: cancel the created order by its id
        requests.patch(f"{API}/orders/{r.json()['id']}/status", headers=H(tok["kasir"]), json={"status": "batal"})
        assert requests.post(f"{API}/orders", headers=H(tok["dapur"]), json={"items": [{"menu_id": mid, "qty": 1}]}).status_code == 403
