"""LiveKit Token Server - 运行在 Win11 上"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, hmac, hashlib, base64, time

API_KEY = b"devkey"
API_SECRET = b"secret"

def b64url(s): return base64.urlsafe_b64encode(s).rstrip(b"=")

def make_token(identity, room):
    header = b64url(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    now = int(time.time())
    payload = b64url(json.dumps({
        "iss": API_KEY.decode(),
        "sub": identity,
        "nbf": now,
        "exp": now + 86400,
        "video": {"room": room, "roomJoin": True, "canPublish": True, "canSubscribe": True}
    }).encode())
    sig = b64url(hmac.new(API_SECRET, header + b"." + payload, hashlib.sha256).digest())
    return (header + b"." + payload + b"." + sig).decode()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type","text/plain")
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()
        parts = self.path.lstrip("/").split("/")
        if len(parts) >= 2:
            token = make_token(parts[0], parts[1])
            self.wfile.write(token.encode())
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()

HTTPServer(("127.0.0.1", 7890), Handler).serve_forever()
