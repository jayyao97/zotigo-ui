[English](../installation.md) | **简体中文**

# 源码安装

UI 安装器构建 Desktop（默认）或 Web，并通过运行 daemon 仓库自身的安装器来安装匹配的本地 `zotigod`。两种客户端也都可以连接已保存的远程 daemon；参见 [主机](usage.md#主机)。

| 运行 | 安装内容 |
| --- | --- |
| `install.sh` | Desktop 应用 + daemon 服务 |
| `install.sh --component web` | Web 服务器 + daemon 服务 |

每次运行只安装一个客户端。如需两个都安装，用相同版本运行两次安装器；第二次运行时，如果 daemon 与固定的 revision 一致，会直接复用。`zotigo` 终端客户端不会被安装；如需使用，请用相同的 prefix 运行 [daemon 仓库的安装器](https://github.com/jayyao97/zotigo/blob/master/README.zh-CN.md#安装)，使用其默认的 `cli` 组件。

前置条件：Git、curl、tar 以及 SHA-256 工具（`sha256sum` 或 `shasum`）。在 macOS 上，如果没有 Git，请安装 Command Line Tools。安装器会复用满足要求的本地 Go/Node 和版本完全一致的 pnpm，否则下载经过校验的私有工具链。Desktop 构建会下载 Electron；Web 构建跳过这一下载。Linux Desktop 还需要图形会话和 Electron 依赖的系统库。服务需要 systemd 用户服务（Linux）或 macOS 图形登录会话。由其他 supervisor 管理的主机请使用 `--no-service`。

## 安装

```sh
# Desktop + daemon
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh | sh
# Web + daemon，安装在开发服务器上
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --component web
# 开发构建、其他 tag 或完整 commit
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --version v0.0.4-dev.57
```

| 选项 | 含义 |
| --- | --- |
| `--component desktop\|web` | 要安装的客户端（默认 `desktop`） |
| `--version TAG\|COMMIT` | 要构建的 UI tag 或完整的 40 位 commit |
| `--source CHECKOUT` | 构建本地 UI checkout（不能与 `--version` 同时使用） |
| `--daemon-source CHECKOUT` | 从本地 checkout 构建 daemon，而不是使用固定的 revision |
| `--prefix PATH` | 安装前缀（默认 `~/.local/share/zotigo`，或 `ZOTIGO_INSTALL_PREFIX`） |
| `--no-service` | 不注册、不启动服务 |

不指定 `--version` 时，安装器选择数值最大的正式版 `vX.Y.Z` tag，排除 `v0.0.4-dev.57` 这类开发 tag。它会先解析选中的 Git 对象，再拉取源码并执行该 revision 的安装器。如果没有正式版 tag，会明确报错，而不是安装某个开发分支。安装完成后，可以在 **设置 → 版本与更新** 中跟随正式版或开发版更新渠道。

Tag 不可变。该 UI revision 中的 `daemon-version` 固定了一个 daemon tag 或完整 commit，其中包含兼容的安装器和 API。不需要 GitHub Releases，也不需要最新版本查询服务。UI 的发布版本写在 `package.json` 中；Desktop 打包以及 Web/Desktop 的安装记录都读取这个值。发布时，更新该值并提交，然后发布对应的 tag（例如 `0.0.1` → `v0.0.1`）。daemon 维护自己的版本常量；两个仓库的版本号不需要一致。每个组件在 `current/INSTALLATION` 中分别记录自己的发布版本、源码 commit 和 dirty 状态。只有当记录的 commit 与固定值一致、两边源码树都是干净的、且 daemon 报告的发布版本与记录一致时，安装器管理的 daemon 才会被复用。缺少记录或记录较旧时需要重新安装；替换前请先结束任务并停止 daemon。这个首版安装器采用精确配对，不会根据任意版本号推断兼容性。

不发布、直接测试未提交的改动：

```sh
sh install.sh --source "$PWD" --daemon-source ../zotigo --component web --no-service --prefix /tmp/zotigo-test
```

`--daemon-source` 是用于开发的固定版本覆盖。UI 构建在 checkout 的一次性副本中进行。测试 Desktop 应用快捷方式时，还应使用临时的 HOME；`--prefix` 只隔离安装的程序，不隔离操作系统快捷方式位置或用户数据。

Go 必须满足配对 daemon 的 `go.mod`；Node 至少为 22.12.0，pnpm 必须与 `package.json` 完全一致。缺失或不满足要求的工具会从官方发行渠道下载到 `PREFIX/toolchains/`，版本和 SHA-256 哈希固定在配对 daemon 的 `scripts/toolchains.tsv` 中。目前 Node 回退到 22.23.2，Go 回退到 daemon 声明的版本，pnpm 回退到 10.30.3。私有下载支持 Linux/macOS 上的 AMD64 和 ARM64。下载内容在解压前校验，在发布前检查，并由每个工具各自的锁保护。下载失败不会影响已有安装。不会修改任何系统工具或 shell profile。

默认前缀是 `~/.local/share/zotigo`（可用 `--prefix` 或 `ZOTIGO_INSTALL_PREFIX` 覆盖）。Desktop 在 macOS 上链接到 `~/Applications/Zotigo.app`，在 Linux 上链接到用户的应用菜单。应用自带 Electron，所以 Node 只在构建时需要。Web 会保存所选 Node 可执行文件的绝对路径，因此无论该运行时来自系统还是私有工具目录，都必须保持安装状态。生成的启动脚本包含所选工具的路径，因此不需要 login shell 初始化。升级时不会覆盖私有版本目录；确认已安装的启动脚本不再使用后，再删除不用的目录。编译后的 Web 和 Desktop 主进程代码使用 Node 内置模块；renderer 依赖由 Vite 打包。

## 运行与配置

安装器会注册并启动本地 daemon；安装 Web 时还会注册并启动 Web 服务。默认地址是 `http://127.0.0.1:8766` 和 `http://127.0.0.1:8080`。使用 `--no-service` 时，安装器会改为打印前台启动路径。

- `PREFIX/config/daemon.env`：daemon 监听地址和 token 文件。配对的 daemon 安装器在首次配置时会生成私有的随机 token，即使只监听 loopback 也是如此。
- `PREFIX/config/web.env`：Web 环境变量，包括 daemon URL 以及 Web 的 host/port/origin/token。
- `PREFIX/config/desktop.json`：已安装 Desktop 的 Local 连接（`baseUrl` 和 `tokenFile` 路径，不包含 token 内容）。已安装的应用会链接到这个文件，因此从应用菜单启动时不需要 shell 环境。显式设置 `ZOTIGOD_URL` 会绕过这些默认值（包括 token）；显式设置 `ZOTIGOD_AUTH_TOKEN_FILE` 会覆盖安装时配置的 token 路径。

`.env` 文件包含受信任的 shell 赋值语句，归执行安装的用户所有；升级时所有这些配置文件都会保留。

只有当对应的配置和 `COMPONENT/current/INSTALLATION` 都不存在时，才会在 daemon 安装完成后创建客户端默认配置。默认配置使用 daemon 已配置的 token 文件和地址（通配绑定地址会转换为 loopback URL）。已有配置永远不会被重写；如果新客户端搭配的是旧版未启用认证的 daemon，它仍保持未认证状态。没有 `desktop.json` 的旧版已安装 Desktop 继续沿用基于环境变量的行为。已安装的 Web 服务缺少配置时会报错，而不是当作全新安装处理。安装中断后重试，会复用已有的配置和凭据。

配对的 daemon revision 是 `daemon-version` 中的 tag 或 commit。发布 UI tag 之前，先发布对应的 daemon tag。同时测试两个仓库中未发布的改动时，使用 `--daemon-source /path/to/zotigo`。

新版 macOS daemon 源码安装器需要一个持久的代码签名证书，并使用标识符 `com.zotigo.daemon`。请按配对 daemon 的 `docs/installation.md` 中的说明配置；UI 安装器会继承 `ZOTIGO_MACOS_SIGNING_IDENTITY`，并把签名交给该安装器处理。已保存的 `~/.config/zotigo/macos-signing-identity` 会在后续构建中复用。Desktop 的开发用 daemon 构建器在替换其稳定的 user-data 二进制文件之前，也会调用源码 checkout 中的 `scripts/sign-macos-daemon.sh`。在 macOS 上，不包含这个辅助脚本的旧版 daemon checkout 不能用于受管理的开发构建；请更新它，或者设置 `ZOTIGO_DESKTOP_MANAGE_DAEMON=0` 并连接到已安装的 daemon。签名失败时会保留之前的二进制文件。开发用 daemon 和已安装的 daemon 使用不同的稳定路径，可能需要分别授予 macOS 权限。这些改动不会重置系统隐私权限，也不会自动配置证书。

如果没有配置登录 token，Web 会在首次启动时生成一个；从 `~/.zotigo/web/access-token`（或 `ZOTIGO_WEB_DATA_DIR/access-token`）读取。这个仅所有者可访问的文件在重启后继续使用。如需轮换 token，先停止 Web，删除该文件后再启动。显式设置 ZOTIGO_WEB_TOKEN 会覆盖该文件，但不会替换它。浏览器登录会话仍会在 12 小时后过期，并在服务器重启时失效。token 本身不会被打印或写入日志。HTTPS、认证和网络要求参见 [Web 服务器配置](#web-服务器配置)。默认的 Local 连接使用同机部署的 daemon。已保存的远程主机在其自身的 daemon 上执行工作区和文本文件操作；Web 后端必须能访问这些地址。

Linux 使用 `zotigo-daemon.service` 和 `zotigo-web.service`：

```sh
systemctl --user status zotigo-web.service
systemctl --user stop zotigo-web.service
systemctl --user start zotigo-web.service
journalctl --user -u zotigo-web.service
```

如需在开机后和退出登录后保持运行，请配置 `loginctl enable-linger "$USER"`（可能需要管理员协助）。在 macOS 上，使用 `launchctl print gui/$(id -u)/com.zotigo.web`、`launchctl bootout gui/$(id -u)/com.zotigo.web` 和 `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.zotigo.web.plist"`。将 `web` 替换为 `daemon` 即可操作后端。两个平台的应用日志都在 `~/.zotigo/logs/` 中。LaunchAgents 只在登录会话中运行；关闭 Desktop 不会停止 daemon。

## Web 服务器配置

Web 服务器读取以下变量（安装器将它们保存在 `PREFIX/config/web.env` 中；使用 `pnpm start:web` 时在环境中设置）：

| 变量 | 默认值 / 用途 |
| --- | --- |
| `ZOTIGOD_URL` | `http://127.0.0.1:8766`；Local 主机。Web 要求该端点为 loopback。 |
| `ZOTIGOD_AUTH_TOKEN_FILE` | 未设置；包含 Local daemon bearer token 的文件 |
| `ZOTIGO_WEB_HOST` | `127.0.0.1` |
| `ZOTIGO_WEB_PORT` | `8080` |
| `ZOTIGO_WEB_ORIGIN` | `http://127.0.0.1:<port>`；浏览器访问的确切 origin，不含路径 |
| `ZOTIGO_WEB_TOKEN` | 覆盖持久化的访问 token；至少 24 个字符 |
| `ZOTIGO_WEB_DATA_DIR` | `~/.zotigo/web`；Web 偏好设置、已保存的主机和访问 token |
| `ZOTIGO_WEB_ALLOW_HTTP` | 未设置；设为 `1` 时允许在非 loopback 绑定上使用 HTTP origin（参见 [局域网访问](#局域网访问)） |

打开配置的 origin，用 `~/.zotigo/web/access-token` 中的 token 登录。登录成功后会设置一个 HttpOnly、SameSite=Strict 的 cookie，12 小时后过期。退出登录会撤销该浏览器会话；服务器重启会使所有会话失效。

不要把 token 放进源码文件、shell 历史、截图或共享的日志中。token 授予的是 daemon 账户能做的全部操作，而不是单个项目的权限。允许其他机器访问之前，请先阅读 [安全与部署边界](../../SECURITY.md)。

### 远程访问

在 Web 服务器前放置 HTTPS 反向代理，并根据你的环境设置合适的网络边界。将 `ZOTIGO_WEB_ORIGIN` 设为浏览器使用的 HTTPS origin。转发匹配的 `Host` 请求头，对 `/api/events` 关闭响应缓冲，允许长时间保持的事件连接，并允许最大 30 MiB 的 JSON 请求体以支持图片上传。不要让不受信任的网络访问到 Web 后端端口和 zotigod；凭据经过网络传输之前必须先完成 TLS 终止。

非 loopback 的 `ZOTIGO_WEB_HOST` 需要显式设置 origin，并且默认要求 HTTPS。在受信任的局域网中，可以设置 `ZOTIGO_WEB_ALLOW_HTTP=1` 并使用 HTTP origin；此时登录凭据和 cookie 以明文传输。这项检查不会配置 TLS 或防火墙。绝不要把 zotigod 本身作为浏览器端点暴露出去。文件路径指向所选 daemon 所在的机器；对 Local 主机来说就是 Web 服务器所在的机器。

## 本地诊断日志

Web 和 Desktop 会自动将后端控制台输出、启动/退出事件、操作失败和未捕获的 JavaScript 异常保存到 `~/.zotigo/logs/web/` 和 `~/.zotigo/logs/desktop/`。daemon 诊断日志在 `~/.zotigo/logs/daemon/`；独立 CLI 的诊断日志在 `~/.zotigo/logs/cli/`。浏览器 DevTools 的控制台输出不会被收集；Desktop renderer 崩溃/加载失败由主进程记录。

每个组件总共最多保留 100 MiB，由所有进程和多次重启共享。单个文件达到 5 MiB 时轮转，另有 128 个文件的上限，避免小文件不断累积。小日志会一直保留，直到任一上限触发清理。各进程写入不同的文件；并发清理时能容忍文件已被删除的情况。上限在写入后检查，因此并发写入可能短暂超出保留额度。旧文件会自动清理，单条记录最大 64 KiB。文件以仅所有者可访问的权限创建。用 `ls -lt ~/.zotigo/logs/web/` 找到最近的文件，然后用 `tail -n 200 /path/to/run-file.log` 查看。分享前请检查内容，因为现有的错误信息可能包含隐私信息。存储不可用时，日志记录尽力而为。

已安装的服务会丢弃重复的 stdout/stderr 输出流，以免服务日志文件无限增长。服务管理器层面的故障仍可通过 `systemctl`/`launchctl` 查看。重新安装旧版服务后，遗留的 `PREFIX/logs/` 文件会保留，在旧服务停止后可以手动删除。项目和对话历史与诊断日志的保留策略相互独立，永远不会被它清理。

## 升级与恢复

已安装的客户端和 daemon 可以在 **设置 → 版本与更新** 中更新；参见 daemon 的 [应用更新](https://github.com/jayyao97/zotigo/blob/master/docs/zh-CN/application-updates.md) 指南。下面的步骤用于通过安装器手动升级。

使用新的 UI tag 运行安装器。它会先构建 UI，再安装缺失或需要替换的 daemon。如果 daemon 需要替换，请先结束任务并停止 daemon；替换某个组件之前，退出 Desktop 或停止/卸载 Web。安装器拒绝替换正在运行的已安装程序。安装期间不要单独重启各组件。

每个组件只在构建完成后才切换自己的 `current` 符号链接，并保留 `previous`。整个安装过程不是跨仓库的事务：如果 daemon 安装成功而后续的 UI 步骤失败，daemon 可能已经被更新。修复报告的错误后重新运行即可。不提供无人值守的后台升级、不重启正在运行的任务，也不自动降级数据。启动失败时会返回错误并打印需要检查的位置；保留的构建只有在数据格式仍然兼容时才能用于手动恢复。

配置和项目/会话数据都存放在程序版本目录之外。卸载时，退出 Desktop，停止并禁用/卸载相关服务，删除对应的服务文件和安装器创建的应用快捷方式，然后删除相关的组件目录。不要通过删除 `~/.zotigo` 来卸载应用。

## 打包与平台验证

`pnpm package:desktop` 使用 Electron Packager 在 `build/desktop/` 中构建本机架构的应用。只暂存构建产物、最小化的 package manifest 和许可证声明。Electron 自身的许可证文件保留在其运行时发行包中。`pnpm build:web` 编译 Node 服务器和浏览器资源，不包含 Electron preload 构建。

这些是从源码构建的开发者安装，不是经过 Developer ID 签名或公证（notarize）的发行版。本地构建并不能保证每一项 macOS 安全策略都允许运行。所有安装器都不会禁用 Gatekeeper、移除隔离属性（quarantine）或禁用 Electron 的沙箱。发布的二进制文件应使用单独的签名/公证流程。

## 局域网访问

daemon 和 Web 的绑定地址相互独立。如需对外暴露 daemon，在 `PREFIX/config/daemon.env` 中设置 `ZOTIGOD_ADDR=0.0.0.0:8766` 和 `ZOTIGOD_AUTH_TOKEN_FILE=/absolute/path/to/daemon.token`。全新安装已经配置了私有 token 文件；修改监听地址时请保留该路径和 token。未启用认证的旧版安装需要在重启前显式配置一个私有的随机 token 文件。
在 `PREFIX/config/web.env` 中设置：

```sh
ZOTIGOD_URL=http://127.0.0.1:8766
ZOTIGOD_AUTH_TOKEN_FILE=/absolute/path/to/daemon.token
ZOTIGO_WEB_HOST=0.0.0.0
ZOTIGO_WEB_PORT=8080
ZOTIGO_WEB_ORIGIN=http://SERVER_IP:8080
ZOTIGO_WEB_ALLOW_HTTP=1
```

在浏览器中使用与配置完全一致的 origin。`ZOTIGO_WEB_ALLOW_HTTP=1` 表示明确允许在受信任的局域网中使用明文 HTTP；凭据和会话 cookie 不会加密。如需 HTTPS，不要设置该变量，并按 [远程访问](#远程访问) 中的说明配置反向代理。Web 仍然需要登录，使用 `~/.zotigo/web/access-token` 中单独的 token。修改配置后，重启两个用户服务。

新安装的 Desktop 客户端使用 `PREFIX/config/desktop.json`；开发环境和旧版安装使用 `ZOTIGOD_URL` 和 `ZOTIGOD_AUTH_TOKEN_FILE` 环境变量；token 文件必须位于 Desktop 所在的主机上。token 由后端读取，永远不会通过 UI 配置 API 返回。API 调用、事件流、图片预览和下载都会携带 daemon 凭据。请求不会跟随 API 重定向；Desktop 的图片重定向仅限于已配置的 daemon 图片路径。

如需让用户服务在最后一次 SSH 退出登录后继续运行，执行 `loginctl enable-linger "$USER"`（需要主机授予该权限），然后用 `loginctl show-user "$USER" -p Linger` 确认。
