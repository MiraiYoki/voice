/**
 * WebRTC 信令服务器 — 多人语音聊天
 *
 * 部署到 Cloudflare Workers（免费）：
 *   npx wrangler deploy
 *
 * 或者本地跑：
 *   node server.js
 *
 * 此服务器只管信令（交换 SDP/ICE），不传输任何音频数据。
 * 音频流在用户之间直传（P2P）。
 */

// ── Cloudflare Workers 入口 ──
export default {
  async fetch(req, env) {
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const room = env.ROOM || new RoomState();
      room.handle(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("WebRTC Signaling Server", { status: 200 });
  }
};

// ── Node.js 本地运行 ──
if (typeof WebSocketPair === "undefined") {
  import("ws").then(({ WebSocketServer }) => {
    const room = new RoomState();
    new WebSocketServer({ port: 8787 }).on("connection", ws => room.handle(ws));
    console.log("信令服务器运行在 ws://localhost:8787");
  });
}

// ═══════════════════════════════════════════════

class RoomState {
  constructor() {
    this.peers = new Map(); // peerId → WebSocket
    this.nextId = 1;
  }

  handle(ws) {
    const peerId = `peer_${this.nextId++}`;
    this.peers.set(peerId, ws);
    console.log(`[+] ${peerId} 加入 (在线 ${this.peers.size} 人)`);

    // 告诉新人他的 ID
    this._send(ws, { type: "welcome", peerId });

    // 告诉已经在房间的人：来新人了
    for (const [id, sock] of this.peers) {
      if (id !== peerId) {
        this._send(sock, { type: "peer-joined", peerId });
      }
    }

    // 把已有成员列表发给新人
    const existing = [...this.peers.keys()].filter(id => id !== peerId);
    this._send(ws, { type: "peer-list", peers: existing });

    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);

      // 转发：offer / answer / ice-candidate → 目标 peer
      if (msg.to && (msg.type === "offer" || msg.type === "answer" || msg.type === "ice-candidate")) {
        const target = this.peers.get(msg.to);
        if (target) {
          this._send(target, {
            type: msg.type,
            from: peerId,
            data: msg.data,
          });
        }
      }
    });

    ws.addEventListener("close", () => {
      this.peers.delete(peerId);
      console.log(`[-] ${peerId} 离开 (在线 ${this.peers.size} 人)`);
      for (const [, sock] of this.peers) {
        this._send(sock, { type: "peer-left", peerId });
      }
    });
  }

  _send(ws, data) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  }
}
