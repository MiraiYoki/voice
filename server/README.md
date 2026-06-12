# LiveKit 服务器部署指南 (Win11)

## 第一步：下载文件

在 Mac 上下载，然后复制到 Win11：

1. LiveKit Server：
   https://github.com/livekit/livekit/releases
   下载 `livekit_版本号_windows_amd64.zip`，解压得到 `livekit-server.exe`
   放到本目录

2. frp 内网穿透：
   https://github.com/fatedier/frp/releases  
   下载 `frp_版本号_windows_amd64.zip`
   解压到本目录下的 `frp/` 文件夹

## 第二步：配置 frp

在 frp 目录下创建 `frpc.ini`：

```ini
[common]
server_addr = 你的frp服务器地址
server_port = 7000

[livekit]
type = tcp
local_ip = 127.0.0.1
local_port = 7880
remote_port = 7880
```

如果没有 frp 服务器，可以用 Cloudflare Tunnel（免费）：
```bash
cloudflared tunnel --url http://localhost:7880
```

## 第三步：启动

1. 双击 `start-livekit.bat` 启动 LiveKit
2. 启动 frp：`frpc -c frpc.ini`
3. 记下公网地址，例如 `your-domain.com:7880`

## 第四步：更新前端配置

在 `index.html` 中修改：
```javascript
const LIVEKIT_URL = 'ws://你的域名:7880';
```

## API Key
- Key: `devkey`
- Secret: `secret`
- 生产环境请修改 livekit.yaml 中的密钥
