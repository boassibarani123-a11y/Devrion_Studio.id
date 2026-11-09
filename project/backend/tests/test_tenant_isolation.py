# Multi-tenant isolation + websocket tests
import os, uuid, json, asyncio
import requests, pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def tok(e, p):
    return requests.post(f"{API}/auth/login", json={"email": e, "password": p}).json()["token"]


@pytest.fixture(scope="module")
def ctx():
    f = tok("founder@devrion.id", os.environ["FOUNDER_PASSWORD"])
    email = f"test_iso_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/founder/restaurants", headers={"Authorization": f"Bearer {f}"},
                      json={"name": "TEST_Iso", "admin_email": email, "admin_password": "Test123!"})
    rid = r.json()["id"]
    ctx = {"a1": tok("admin@kopisenja.id", "Admin123!"), "a2": tok(email, "Test123!"), "f": f}
    yield ctx
    requests.patch(f"{API}/founder/restaurants/{rid}", headers={"Authorization": f"Bearer {f}"}, json={"active": False})


def test_new_resto_sees_no_foreign_data(ctx):
    h2 = {"Authorization": f"Bearer {ctx['a2']}"}
    assert requests.get(f"{API}/menu", headers=h2).json() == []
    assert requests.get(f"{API}/orders?scope=all", headers=h2).json() == []


def test_patch_foreign_outlet_does_not_leak(ctx):
    h1 = {"Authorization": f"Bearer {ctx['a1']}"}
    h2 = {"Authorization": f"Bearer {ctx['a2']}"}
    foreign = requests.get(f"{API}/outlets", headers=h1).json()[0]
    r = requests.patch(f"{API}/outlets/{foreign['id']}", headers=h2, json={"name": foreign["name"], "address": foreign.get("address", "")})
    body = r.json()
    assert not (isinstance(body, dict) and body.get("restaurant_id") == foreign["restaurant_id"]), "foreign outlet leaked"


def test_patch_foreign_table_does_not_leak(ctx):
    h1 = {"Authorization": f"Bearer {ctx['a1']}"}
    h2 = {"Authorization": f"Bearer {ctx['a2']}"}
    t = requests.get(f"{API}/tables", headers=h1).json()[0]
    r = requests.patch(f"{API}/tables/{t['id']}", headers=h2, json={"name": t["name"], "outlet_id": t["outlet_id"]})
    body = r.json()
    assert not (isinstance(body, dict) and body.get("code") == t["code"]), "foreign table code leaked"


def test_websocket_receives_order_event():
    import websockets
    kasir = tok("kasir@kopisenja.id", "Staff123!")
    ws_url = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws?token={kasir}"

    async def run():
        async with websockets.connect(ws_url, open_timeout=15) as ws:
            menu = requests.get(f"{API}/public/menu/demo-meja-3").json()["menu"]
            requests.post(f"{API}/public/orders", json={"code": "demo-meja-3", "customer_name": "TEST_WS",
                                                        "items": [{"menu_id": menu[0]["id"], "qty": 1}]})
            msg = await asyncio.wait_for(ws.recv(), timeout=10)
            return json.loads(msg)
    ev = asyncio.run(run())
    assert ev["type"] == "order_new" and ev["order"]["customer_name"] == "TEST_WS"
    assert "public_token" not in ev["order"]
    # cleanup: cancel the created order by its id
    requests.patch(f"{API}/orders/{ev['order']['id']}/status", headers={"Authorization": f"Bearer {kasir}"}, json={"status": "batal"})
