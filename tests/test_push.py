"""Notifications to relatives: the encryption for the phone, and the alerts kept."""

import json
import os
import struct
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from server import accounts, push


def hkdf(salt, secret, info, length):
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(secret)


def decrypt_on_phone(body, phone, auth):
    """What the phone does with a message (RFC 8291), written apart from push.py."""
    salt, record_size, key_length = body[:16], *struct.unpack("!IB", body[16:21])
    server_public = body[21:21 + key_length]
    phone_public = phone.public_key().public_bytes(*push.POINT)
    shared = phone.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server_public))
    secret = hkdf(auth, shared, b"WebPush: info\x00" + phone_public + server_public, 32)
    key = hkdf(salt, secret, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = hkdf(salt, secret, b"Content-Encoding: nonce\x00", 12)
    plain = AESGCM(key).decrypt(nonce, body[21 + key_length:], None)
    assert plain.endswith(b"\x02") and record_size == push.RECORD_SIZE
    return plain[:-1]


class InTempFolder(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        patch = mock.patch.object(accounts, "DATA_DIR", Path(folder.name))
        patch.start()
        self.addCleanup(patch.stop)
        accounts._wrong_codes.clear()


class Encryption(InTempFolder):
    def test_the_phone_reads_the_message(self):
        phone = ec.generate_private_key(ec.SECP256R1())
        auth = os.urandom(16)
        message = json.dumps({"title": "Helen may be lost", "body": "Café"}).encode()
        body = push.encrypt(message, push.b64(phone.public_key().public_bytes(*push.POINT)), push.b64(auth))
        self.assertEqual(decrypt_on_phone(body, phone, auth), message)

    def test_the_signature_checks_with_the_public_key(self):
        header = push._authorization("https://web.push.apple.com/abc")
        token = header.split("t=")[1].split(",")[0]
        self.assertEqual(header.split("k=")[1], push.public_key())
        head, claims, signature = token.split(".")
        raw = push.unb64(signature)
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), push.unb64(push.public_key()))
        key.verify(encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")),
                   f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))
        self.assertEqual(json.loads(push.unb64(claims))["aud"], "https://web.push.apple.com")

    def test_the_key_is_kept(self):
        self.assertEqual(push.public_key(), push.public_key())
        self.assertTrue(push._key_file().exists())


class Alerts(InTempFolder):
    def setUp(self):
        super().setUp()
        self.helen = accounts.user_for(accounts.sign_up("helen@example.com", "password1")["token"])
        self.sarah = accounts.user_for(accounts.sign_up("sarah@example.com", "password2")["token"])
        self.paul = accounts.user_for(accounts.sign_up("paul@example.com", "password3")["token"])
        accounts.join(self.sarah, accounts.invite(self.helen, "Helen")["code"], "Sarah")

    def test_only_linked_relatives_see_the_alert(self):
        accounts.add_alert(self.helen, {"lat": 48.86, "lon": 2.34, "title": "Coffee with Rose", "times": 2})
        seen = accounts.alerts_for(self.sarah)
        self.assertEqual([(a["name"], a["title"], a["times"]) for a in seen], [("Helen", "Coffee with Rose", 2)])
        self.assertEqual(accounts.alerts_for(self.paul), [])

    def test_old_alerts_are_not_shown(self):
        accounts.add_alert(self.helen, {"lat": 48.86, "lon": 2.34})
        later = time.time() + accounts.ALERTS_SHOWN_SECONDS + 1
        with mock.patch.object(accounts.time, "time", return_value=later):
            self.assertEqual(accounts.alerts_for(self.sarah), [])

    def test_a_phone_subscribes_once(self):
        accounts.subscribe(self.sarah, "https://push.example/1", "key", "auth")
        accounts.subscribe(self.sarah, "https://push.example/1", "key2", "auth2")
        self.assertEqual(accounts.subscriptions(self.sarah),
                         [{"endpoint": "https://push.example/1", "p256dh": "key2", "auth": "auth2", "lang": "en"}])
        accounts.unsubscribe("https://push.example/1")
        self.assertEqual(accounts.subscriptions(self.sarah), [])

    def test_a_phone_in_french(self):
        accounts.subscribe(self.sarah, "https://push.example/2", "k", "a", "fr")
        self.assertEqual(accounts.subscriptions(self.sarah)[0]["lang"], "fr")

    def test_the_name_given_to_relatives(self):
        self.assertEqual(accounts.person_name(self.helen), "Helen")
        self.assertIsNone(accounts.person_name(self.paul))


if __name__ == "__main__":
    unittest.main()
