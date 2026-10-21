"""Notifications on a relative's phone (Web Push), sent by this server.

A relative's app asks the phone for a push subscription and gives it to this server.
To notify, the server encrypts the message for that phone (RFC 8291) and sends it to
the push service of the phone's maker (Apple, Google or Mozilla), signed with this
server's own key (VAPID, RFC 8292). The push service carries the message but cannot
read it. The key is made once and kept outside the project folder.
"""

import base64
import json
import os
import struct
import time
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from . import accounts

# Push services ask who sends, to contact them if something goes wrong.
CONTACT = os.environ.get("DEZHEIMER_PUSH_CONTACT", "https://github.com/izehavi/dezheimer")
KEEP_SECONDS = 24 * 3600     # a phone that is off gets the message when it comes back, within a day
RECORD_SIZE = 4096
POINT = serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _key_file():
    return accounts.DATA_DIR / "push" / "vapid.pem"


def _key() -> ec.EllipticCurvePrivateKey:
    path = _key_file()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        key = ec.generate_private_key(ec.SECP256R1())
        path.write_bytes(key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def public_key() -> str:
    """This server's public key, which the app gives the phone when it subscribes."""
    return b64(_key().public_key().public_bytes(*POINT))


def _hkdf(salt: bytes, secret: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(secret)


def encrypt(payload: bytes, p256dh: str, auth: str) -> bytes:
    """The message, encrypted for one phone (RFC 8291, aes128gcm), as one record."""
    phone_public = unb64(p256dh)
    phone_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), phone_public)
    ours = ec.generate_private_key(ec.SECP256R1())   # a new key for each message
    our_public = ours.public_key().public_bytes(*POINT)
    shared = ours.exchange(ec.ECDH(), phone_key)
    secret = _hkdf(unb64(auth), shared, b"WebPush: info\x00" + phone_public + our_public, 32)
    salt = os.urandom(16)
    key = _hkdf(salt, secret, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, secret, b"Content-Encoding: nonce\x00", 12)
    # 0x02 marks the last (and only) record.
    record = AESGCM(key).encrypt(nonce, payload + b"\x02", None)
    return salt + struct.pack("!IB", RECORD_SIZE, len(our_public)) + our_public + record


def _authorization(endpoint: str) -> str:
    """Signed proof that this server sends the message (VAPID)."""
    parts = urlsplit(endpoint)
    header = b64(json.dumps({"typ": "JWT", "alg": "ES256"}).encode())
    claims = b64(json.dumps({
        "aud": f"{parts.scheme}://{parts.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": CONTACT,
    }).encode())
    r, s = decode_dss_signature(_key().sign(f"{header}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
    signature = b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={header}.{claims}.{signature}, k={public_key()}"


def send(subscription: dict, message: dict) -> int:
    """Send `message` to one phone. Returns the status of the push service (201 when taken).

    404 and 410 mean the subscription no longer exists: the caller forgets it.
    """
    body = encrypt(json.dumps(message).encode(), subscription["p256dh"], subscription["auth"])
    try:
        res = httpx.post(subscription["endpoint"], content=body, timeout=15, headers={
            "Authorization": _authorization(subscription["endpoint"]),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(KEEP_SECONDS),
            "Urgency": "high",
        })
    except httpx.HTTPError:
        return 0
    return res.status_code
