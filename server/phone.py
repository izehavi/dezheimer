"""Use the app from a phone on the same Wi-Fi: python -m server.phone

The phone is only the screen, the microphone and the loudspeaker. The models still
run on this computer, and nothing goes through the internet.

Three things are needed that the normal start does not have:
- the server listens on the home network, not only on this computer;
- a secure address (https): phone browsers only give the microphone and the position
  to secure pages. This computer makes its own certificate, which the phone must be
  told to trust once. A small plain page explains how and gives the certificate;
- a code: anyone on the same Wi-Fi can reach the address, so the phone must give a
  code, once, shown in the window of this computer.
"""

import asyncio
import datetime as dt
import hmac
import ipaddress
import json
import secrets
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

import uvicorn
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from .__main__ import PORT as LOCAL_PORT
from .__main__ import already_running
from .accounts import DATA_DIR

PHONE_PORT = 8443   # the app, secure
SETUP_PORT = 8767   # the plain page that gives the certificate
PHONE_DIR = Path(DATA_DIR) / "phone"
COOKIE = "dezheimer_phone"
MAX_WRONG_CODES = 10
LOOPBACK = {"127.0.0.1", "::1"}


def home_address() -> str:
    """The address of this computer on the home network."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # nothing is sent: this only picks the network card
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


# ---- Certificate ----

def certificate(address: str) -> dict:
    """Paths of the authority certificate and of the server certificate and key for `address`.

    The authority is made once and is what the phone trusts. The server certificate is
    made again when the address of this computer changes or when it is about to expire
    (phones refuse certificates valid for more than about 13 months).
    """
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    PHONE_DIR.mkdir(parents=True, exist_ok=True)
    paths = {name: PHONE_DIR / file for name, file in (
        ("ca", "authority.pem"), ("ca_key", "authority-key.pem"), ("cert", "server.pem"), ("key", "server-key.pem"))}
    now = dt.datetime.now(dt.timezone.utc)
    pem = serialization.Encoding.PEM

    def name(text):
        return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, text)])

    def write_key(path, key):
        path.write_bytes(key.private_bytes(pem, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

    if not (paths["ca"].exists() and paths["ca_key"].exists()):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = name(f"Dezheimer on {socket.gethostname()}")
        ca = (
            x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True, content_commitment=False,
                key_encipherment=False, data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .sign(key, hashes.SHA256())
        )
        write_key(paths["ca_key"], key)
        paths["ca"].write_bytes(ca.public_bytes(pem))
        paths["cert"].unlink(missing_ok=True)

    def still_good():
        if not (paths["cert"].exists() and paths["key"].exists()):
            return False
        cert = x509.load_pem_x509_certificate(paths["cert"].read_bytes())
        names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        return (ipaddress.ip_address(address) in names.get_values_for_type(x509.IPAddress)
                and cert.not_valid_after_utc > now + dt.timedelta(days=30))

    if not still_good():
        ca = x509.load_pem_x509_certificate(paths["ca"].read_bytes())
        ca_key = serialization.load_pem_private_key(paths["ca_key"].read_bytes(), password=None)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cert = (
            x509.CertificateBuilder().subject_name(name(address)).issuer_name(ca.subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=390))
            .add_extension(x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.ip_address(address)),
                x509.DNSName(socket.gethostname()), x509.DNSName("localhost"),
            ]), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca.public_key()), critical=False)
            .sign(ca_key, hashes.SHA256())
        )
        write_key(paths["key"], key)
        paths["cert"].write_bytes(cert.public_bytes(pem))
    return paths


# ---- Code ----

def pairing() -> dict:
    """The code the phone must give once, and the secret kept by a phone that gave it."""
    PHONE_DIR.mkdir(parents=True, exist_ok=True)
    path = PHONE_DIR / "pairing.json"
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        made = {"code": f"{secrets.randbelow(10**6):06d}", "secret": secrets.token_hex(24)}
        path.write_text(json.dumps(made))
        return made


CODE_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Dezheimer</title>
<style>body{font:20px system-ui;margin:0;padding:48px 24px;background:#FBF7F0;color:#1B2430;text-align:center}
input,button{font:inherit;font-size:28px;padding:14px;border-radius:14px;border:2px solid #E2DACB;width:100%;max-width:320px;
box-sizing:border-box;text-align:center;margin-top:16px}button{background:#0F5E63;color:#fff;border-color:#0F5E63;font-weight:700}
.error{color:#A32020;font-weight:700}</style></head><body>
<h1>Dezheimer</h1><p>Type the code shown in the Dezheimer window on the computer.</p>
__ERROR__
<form method="post" action="/pair"><input name="code" inputmode="numeric" autocomplete="off" maxlength="6" autofocus>
<button type="submit">Open</button></form></body></html>"""


def protect(app, pair: dict) -> None:
    """Only this computer, and phones that gave the code, can use the app."""
    wrong = {"count": 0}

    @app.middleware("http")
    async def gate(request: Request, call_next):
        if request.client and request.client.host in LOOPBACK:
            return await call_next(request)
        if hmac.compare_digest(request.cookies.get(COOKIE, ""), pair["secret"]):
            return await call_next(request)

        if request.url.path == "/pair" and request.method == "POST":
            if wrong["count"] >= MAX_WRONG_CODES:
                return HTMLResponse(CODE_PAGE.replace(
                    "__ERROR__", '<p class="error">Too many wrong codes. Close the Dezheimer window on the computer and start it again.</p>'), 429)
            # The form is read by hand, so that no extra package is needed.
            code = (parse_qs((await request.body()).decode("utf-8", "replace")).get("code") or [""])[0]
            if hmac.compare_digest(code.strip(), pair["code"]):
                response = RedirectResponse("/", status_code=303)
                response.set_cookie(COOKIE, pair["secret"], max_age=365 * 24 * 3600, secure=True, httponly=True, samesite="lax")
                return response
            wrong["count"] += 1
            return HTMLResponse(CODE_PAGE.replace("__ERROR__", '<p class="error">This is not the right code.</p>'), 401)

        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "This phone has not given the code yet."}, 401)
        return HTMLResponse(CODE_PAGE.replace("__ERROR__", ""))


# ---- The plain page that gives the certificate ----

SETUP_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Dezheimer on the iPhone</title>
<style>body{font:19px/1.5 system-ui;margin:0 auto;max-width:640px;padding:28px 20px;background:#FBF7F0;color:#1B2430}
h1{font-size:30px}li{margin-bottom:14px}a.big{display:block;text-align:center;background:#0F5E63;color:#fff;font-weight:700;
padding:16px;border-radius:14px;text-decoration:none;margin:10px 0}code{background:#fff;padding:2px 6px;border-radius:6px}</style></head><body>
<h1>Dezheimer on the iPhone</h1>
<p>To read this page on the iPhone, open Safari there and type: <code>__SETUP__</code></p>
<p>The iPhone and the computer must be on the same Wi-Fi. Do steps 1 to 3 once, in <b>Safari</b> on the iPhone.</p>
<ol>
<li><b>Get the certificate.</b><a class="big" href="/dezheimer.crt">Download the certificate</a>Tap <b>Allow</b>. The iPhone says the profile was downloaded.</li>
<li><b>Install it.</b> Open <b>Settings</b>. Tap <b>Profile Downloaded</b> near the top (or General, then VPN &amp; Device Management), then <b>Install</b>, and enter the code of the iPhone.</li>
<li><b>Trust it.</b> In Settings, open <b>General</b>, <b>About</b>, and at the very bottom <b>Certificate Trust Settings</b>. Switch on <b>__CA__</b>.</li>
<li><b>Open the app.</b><a class="big" href="__APP__">__APP__</a>Type the 6-digit code shown in the Dezheimer window on the computer. Allow the microphone and the position when Safari asks.</li>
<li><b>Put it on the home screen.</b> In Safari, tap the Share button, then <b>Add to Home Screen</b>. Dezheimer then opens like an app.</li>
</ol>
<p>The certificate only lets this iPhone trust this computer. To remove it later: Settings, General, VPN &amp; Device Management.</p>
</body></html>"""


def serve_setup(address: str, ca_path: Path) -> None:
    from cryptography import x509

    ca_name = x509.load_pem_x509_certificate(ca_path.read_bytes()).subject.rfc4514_string().removeprefix("CN=")
    page = (SETUP_PAGE.replace("__APP__", f"https://{address}:{PHONE_PORT}").replace("__CA__", ca_name)
            .replace("__SETUP__", f"http://{address}:{SETUP_PORT}")).encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/dezheimer.crt":
                body, kind = ca_path.read_bytes(), "application/x-x509-ca-cert"
            else:
                body, kind = page, "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", SETUP_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


# ---- Start ----

async def serve(paths: dict) -> None:
    from .app import app

    # The same app, and so the same models, answers this computer and the phone.
    servers = [
        uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=LOCAL_PORT, log_level="warning")),
        uvicorn.Server(uvicorn.Config(
            app, host="0.0.0.0", port=PHONE_PORT, log_level="warning",
            ssl_certfile=str(paths["cert"]), ssl_keyfile=str(paths["key"]))),
    ]

    async def run(server):
        try:
            await server.serve()
        finally:
            for other in servers:
                other.should_exit = True

    await asyncio.gather(*(run(s) for s in servers))


if __name__ == "__main__":
    if already_running():
        print("Dezheimer is already running in another window. Close that window, then start this again.")
        raise SystemExit(1)

    address = home_address()
    if address.startswith("127."):
        print("This computer is not connected to a network, so a phone cannot reach it.")
        raise SystemExit(1)

    paths = certificate(address)
    pair = pairing()
    from .app import app
    protect(app, pair)
    serve_setup(address, paths["ca"])

    print("Dezheimer is starting, for this computer and for a phone on the same Wi-Fi.")
    print("Keep this window open while you use the app. Close it to stop.")
    print()
    print("If Windows asks whether Python may be reached from the network, answer: Allow (private networks).")
    print()
    print(f"  First time on the iPhone, in Safari:   http://{address}:{SETUP_PORT}")
    print(f"  The app on the iPhone:                 https://{address}:{PHONE_PORT}")
    print(f"  Code asked by the iPhone, once:        {pair['code']}")
    print(f"  The app on this computer:              http://localhost:{LOCAL_PORT}")
    print()
    threading.Timer(1.5, webbrowser.open, [f"http://localhost:{SETUP_PORT}"]).start()
    try:
        asyncio.run(serve(paths))
    except KeyboardInterrupt:
        pass
