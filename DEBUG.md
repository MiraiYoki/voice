# 空间语音聊天室 · 踩坑全记录

## 架构

```
index.html (纯静态单文件, GitHub Pages 部署)
  ├── 房间发现: EMQX 公共 MQTT Broker (broker.emqx.io:8084)
  ├── P2P 信令: PeerJS 云端 (0.peerjs.com)
  ├── P2P 音频: WebRTC (peer-to-peer, 不经过服务器)
  ├── 空间音频: Web Audio API (PannerNode + StereoPanner + GainNode)
  └── 位置同步: MQTT 广播 (x,y), 30ms 间隔
```

**零服务器、零备案。** 信令和房间发现用的都是公共免费服务，音频直连 P2P。

---

## 移动端蓝牙/音频路由问题

### 核心矛盾

`getUserMedia` 激活时，手机操作系统将音频会话强制切为"通话模式" (HFP):
- 蓝牙走 HFP 单声道
- 立体声音乐协议 A2DP 被抑制
- 这是 iOS AudioSession / Android AudioManager 的硬件层限制，Web API 改不了

`getUserMedia` 释放后，手机恢复"音乐模式" (A2DP):
- 蓝牙立体声可用
- 但 WebRTC 因为没有本地音频流，无法接听/发起通话

**结论: 移动端网页语音聊天中，立体声和麦克风无法同时存在。**

### 已验证的状态矩阵

| 状态 | 蓝牙 | 立体声 | 能否说话 | 能否听见别人 |
|------|:---:|:---:|:---:|:---:|
| 麦克风始终在线 (默认) | ✅ HFP | ❌ | ✅ | ✅ |
| 完全无麦克风 (纯收听) | ✅ A2DP | ✅ | ❌ | ✅ |
| 关麦→开麦切换 | ❌ 切到扬声器 | ❌ | ✅ | ❌ 链路断了 |

### 核心不变式

**`getUserMedia` 必须早于 `AudioContext` 创建。** 顺序反了蓝牙会直接断开切扬声器。正确顺序:

```javascript
// ✅ 正确
localStream = await getUserMedia({ audio: true });
await sleep(100);  // 给系统 100ms 稳定音频会话
audioCtx = new AudioContext();

// ❌ 错误 (蓝牙断, 扬声器外放)
audioCtx = new AudioContext();
localStream = await getUserMedia({ audio: true });
```

### 推讲模式 (立体声收听 ⇄ 单声道发言)

原理上可行 — 关麦释放 `getUserMedia` 恢复立体声, 开麦重建 `getUserMedia` 切换通话模式。但工程实现有两道坎:

1. **关麦后重建 AudioContext 时远端音频链路会断** — 因为 `audioCtx.close()` 销毁了所有 `MediaStreamSource`/`PannerNode`/`GainNode`。解法是保存 `remoteStream` 引用，重建全部节点。原理上走得通，但容易踩坑。

2. **开麦时 AudioContext 已在运行 → 蓝牙切扬声器。** 解法是先 `audioCtx.close()`，再 `getUserMedia`，最后重建 AudioContext。但重建成本高 + replaceTrack 与 PeerJS 的兼容性问题导致远端听不到声音。

**当前结论: 推讲模式原理可行，但 WebRTC 无缝切换音频轨的工程细节尚未完全解决。** 需要更好的 PeerJS track 管理方案。

---

## 空间音频

### 五种算法

| 模式 | 节点链路 | 特点 |
|------|---------|------|
| 真实 (HRTF) | source → panner(HRTF) → dst | 真实空间化, 左右保守 |
| 均衡 (EqualPower) | source → panner(equalpower) → dst | 比 HRTF 更明显的 L/R |
| 声像 (StereoOnly) | source → stereoPan → gain → dst | 绕过 Panner, 手动距离 |
| 混合 (Hybrid) | source → stereoPan → panner(HRTF) → dst | 叠加方案 |
| 手动 (Custom) | source → stereoPan → gain → dst | 绕过 Panner, tanh×3.0 极端 pan |

### 关键发现

- **PannerNode 在链路里会吃掉 StereoPanner 的左右分离** — 因为 HRTF 优先用自己的空间模型, 把 stereo pan 的效果覆盖了。"声像"和"手动"模式绕开 PannerNode 后才有明显的左右分离。

- **距离衰减始终有效** — 无论哪种模式, `refDistance=2m` 内满音量, `maxDistance=18m` 外静音, 中间按反比衰减。这是单声道也能感知到的核心功能。

- **前后声道** — 将地图 Y 轴映射到音频 Z 轴, PannerNode HRTF 自动处理前后差异 (背后声音更闷)。

- **StereoPannerNode/ChannelMerger 的左右分离在桌面端明显, 移动端可能被系统合并为单声道。** 移动端测试立体声需要先确认硬件/OS 没有强制合并声道。

---

## 自动避让 (Ducking)

- 每个远端流挂 `AnalyserNode` 跟踪平滑音量
- 每 100ms 找最响者 → 满音量 → 其余压到 30%
- `gainNode.gain.value` 平滑过渡避免爆音
- 问题: "谁大谁抢"在两人同时说话时会来回跳, 不如视觉高亮 + DM 控场实用

---

## 其他已知问题

### 临时文件系统满

Claude Code 运行期间 `/private/tmp/claude-501/.../tasks` 会满。解决方案: 改为在一个固定的 git 仓库内工作, 用 Read/Edit/Write 工具替代 Bash 做文件操作。

### Git Push 冲突

多个 force push + merge 导致 `.git` 目录偶尔丢失、分支分叉。教训: 避免 force push, 用 `git pull --rebase` 代替。

### 版本号

每次推之前更新页面上的版本号 (v1 → v31), 用户用 `?v=N` 强制跳过浏览器缓存。

---

## 功能清单 (v31 可用)

- [x] 纯静态单文件, GitHub Pages 部署
- [x] P2P 语音通话 (WebRTC + PeerJS)
- [x] 房间发现 (MQTT, 同房间名自动匹配)
- [x] 2D 地图拖拽移动 (鼠标/触摸/WASD)
- [x] 位置实时同步 (30ms 间隔 MQTT 广播)
- [x] 5 种空间音频算法可切换
- [x] 距离衰减 (2m 满音量, 18m 外静音)
- [x] 前后声道 (Y 轴映射 Z 轴, HRTF)
- [x] 自动避让 (音量最大者优先)
- [x] 蓝牙 HFP 单声道稳定连接
- [x] 静音开关 (track.enabled)
- [x] 双击 Ping 波纹
- [x] 成员计数
- [x] 立体声硬件测试 (440Hz/660Hz 分声道)
- [ ] 推讲模式 (立体声收听, 需进一步工程化)
- [ ] 移动端立体声 (受 OS 限制, 需原生 App)
