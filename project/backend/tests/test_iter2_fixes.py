# Iteration 2 regression: tenant-scoped PATCH/regenerate (404), foreign outlet_id (400), dapur one-stage rule
import os, uuid
import requests, pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def tok(e, p):
    r = requests.post(f"{API}/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctx():
    f = tok("founder@devrion.id", os.environ["FOUNDER_PASSWORD"])
    email = f"test_it2_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/founder/restaurants", headers=H(f),
                      json={"name": "TEST_Iter2", "admin_email": email, "admin_password": "Test123!"})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    a1 = tok("admin@kopisenja.id", "Admin123!")
    a2 = tok(email, "Test123!")
    c = {"a1": a1, "a2": a2, "f": f, "kasir": tok("kasir@kopisenja.id", "Staff123!"),
         "dapur": tok("dapur@kopisenja.id", "Staff123!"),
         "o1": requests.get(f"{API}/outlets", headers=H(a1)).json()[0],
         "o2": requests.get(f"{API}/outlets", headers=H(a2)).json()[0],
         "t1": requests.get(f"{API}/tables", headers=H(a1)).json()[0],
         "cleanup": []}
    yield c
    for kind, iid, t in c["cleanup"]:
        if kind == "order":
            requests.patch(f"{API}/orders/{iid}/status", headers=H(t), json={"status": "batal"})
        else:
            requests.delete(f"{API}/{kind}/{iid}", headers=H(t))
    requests.patch(f"{API}/founder/restaurants/{rid}", headers=H(f), json={"active": False})


# --- tenant isolation: foreign ids must 404, never 500 or leak
def test_patch_foreign_outlet_404(ctx):
    r = requests.patch(f"{API}/outlets/{ctx['o1']['id']}", headers=H(ctx["a2"]), json={"name": "TEST_hack", "address": ""})
    assert r.status_code == 404
    assert requests.get(f"{API}/outlets", headers=H(ctx["a1"])).json()[0]["name"] == ctx["o1"]["name"]


def test_patch_foreign_table_404(ctx):
    r = requests.patch(f"{API}/tables/{ctx['t1']['id']}", headers=H(ctx["a2"]),
                       json={"name": "TEST_hack", "outlet_id": ctx["o2"]["id"]})
    assert r.status_code == 404


def test_regenerate_foreign_table_404(ctx):
    r = requests.post(f"{API}/tables/{ctx['t1']['id']}/regenerate", headers=H(ctx["a2"]))
    assert r.status_code == 404
    t = [x for x in requests.get(f"{API}/tables", headers=H(ctx["a1"])).json() if x["id"] == ctx["t1"]["id"]][0]
    assert t["code"] == ctx["t1"]["code"]


def test_patch_foreign_category_404(ctx):
    cat = requests.get(f"{API}/categories", headers=H(ctx["a1"])).json()[0]
    r = requests.patch(f"{API}/categories/{cat['id']}", headers=H(ctx["a2"]), json={"name": "TEST_hack", "icon": "x", "sort": 0})
    assert r.status_code == 404


def test_patch_foreign_menu_404(ctx):
    m = requests.get(f"{API}/menu", headers=H(ctx["a1"])).json()[0]
    r = requests.patch(f"{API}/menu/{m['id']}", headers=H(ctx["a2"]),
                       json={"name": "TEST_hack", "price": 1, "category_id": m["category_id"]})
    assert r.status_code == 404
    m2 = [x for x in requests.get(f"{API}/menu", headers=H(ctx["a1"])).json() if x["id"] == m["id"]][0]
    assert m2["name"] == m["name"]


# --- outlet ownership checks -> 400
def test_patch_own_table_foreign_outlet_400(ctx):
    r = requests.patch(f"{API}/tables/{ctx['t1']['id']}", headers=H(ctx["a1"]),
                       json={"name": ctx["t1"]["name"], "outlet_id": ctx["o2"]["id"]})
    assert r.status_code == 400


def test_patch_staff_foreign_outlet_400(ctx):
    staff = requests.get(f"{API}/staff", headers=H(ctx["a1"])).json()[0]
    r = requests.patch(f"{API}/staff/{staff['id']}", headers=H(ctx["a1"]), json={"outlet_id": ctx["o2"]["id"]})
    assert r.status_code == 400


def test_patch_foreign_staff_not_leaked(ctx):
    staff = requests.get(f"{API}/staff", headers=H(ctx["a1"])).json()[0]
    r = requests.patch(f"{API}/staff/{staff['id']}", headers=H(ctx["a2"]), json={"name": "TEST_hack"})
    assert r.status_code in (200, 404)
    assert not (isinstance(r.json(), dict) and r.json().get("email") == staff["email"])
    s2 = [x for x in requests.get(f"{API}/staff", headers=H(ctx["a1"])).json() if x["id"] == staff["id"]][0]
    assert s2["name"] == staff["name"]


def test_admin_order_foreign_outlet_400(ctx):
    m = [x for x in requests.get(f"{API}/menu", headers=H(ctx["a1"])).json() if x["available"]][0]
    r = requests.post(f"{API}/orders", headers=H(ctx["a1"]),
                      json={"items": [{"menu_id": m["id"], "qty": 1}], "outlet_id": ctx["o2"]["id"], "customer_name": "TEST_x"})
    assert r.status_code == 400


def test_expense_foreign_outlet_400(ctx):
    r = requests.post(f"{API}/expenses", headers=H(ctx["a1"]),
                      json={"title": "TEST_exp", "amount": 1000, "outlet_id": ctx["o2"]["id"]})
    assert r.status_code == 400
    if r.status_code == 200:
        ctx["cleanup"].append(("expenses", r.json()["id"], ctx["a1"]))


def test_expense_own_outlet_ok(ctx):
    r = requests.post(f"{API}/expenses", headers=H(ctx["a1"]),
                      json={"title": "TEST_exp_ok", "amount": 1000, "outlet_id": ctx["o1"]["id"],
                            "date": "2020-01-01T00:00:00+00:00"})  # old date: keeps parallel report test unaffected
    assert r.status_code == 200
    ctx["cleanup"].append(("expenses", r.json()["id"], ctx["a1"]))
    assert r.json()["outlet_id"] == ctx["o1"]["id"]


# --- dapur moves one stage at a time
def test_dapur_one_stage_rule(ctx):
    m = [x for x in requests.get(f"{API}/menu", headers=H(ctx["kasir"])).json() if x["available"]][0]
    r = requests.post(f"{API}/orders", headers=H(ctx["kasir"]),
                      json={"items": [{"menu_id": m["id"], "qty": 1}], "customer_name": "TEST_dapur", "paid": True})
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    ctx["cleanup"].append(("order", oid, ctx["kasir"]))
    assert r.json()["status"] == "baru"
    assert requests.patch(f"{API}/orders/{oid}/status", headers=H(ctx["dapur"]), json={"status": "siap"}).status_code == 400
    assert requests.patch(f"{API}/orders/{oid}/status", headers=H(ctx["dapur"]), json={"status": "disajikan"}).status_code == 400
    r = requests.patch(f"{API}/orders/{oid}/status", headers=H(ctx["dapur"]), json={"status": "dimasak"})
    assert r.status_code == 200 and r.json()["status"] == "dimasak"
    r = requests.patch(f"{API}/orders/{oid}/status", headers=H(ctx["dapur"]), json={"status": "baru"})
    assert r.status_code == 200 and r.json()["status"] == "baru"
    assert requests.patch(f"{API}/orders/{oid}/status", headers=H(ctx["dapur"]), json={"status": "batal"}).status_code == 403
