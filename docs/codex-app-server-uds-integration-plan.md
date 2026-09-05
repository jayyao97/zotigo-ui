# Codex App Server UDS 接入方案

> 状态：完成原 5 轮方案评审；2026-08-22 Project/runtime interface 增量设计经独立复审，未关闭 finding 为 0
> 更新时间：2026-08-21
> 评审上限：5 轮，问题收敛后提前结束
> 增量评审：产品决策变化后按受影响领域复审，直到协议、interface、恢复/并发 reviewer 均无 finding

## 1. 结论

Zotigo 通过 Unix Domain Socket（UDS）接入 `codex app-server`，但不让 Zotigo Desktop 直接连接它。

```text
Zotigo Desktop
    │
    │ zotigod public HTTP + SSE
    ▼
zotigod
    ├── Project / Workspace / Session source of truth
    ├── Agent catalog and session routing
    └── CodexHostManager
             │ manages one child process per daemon
             ▼
       codex app-server
       --listen unix://<zotigo-runtime-dir>/codex.sock
             ▲
             │ WebSocket over UDS, JSON-RPC 2.0
             │
       Codex session worker
```

核心决策：

- Project 和 Workspace 继续完全由 zotigod 管理；Codex 只获得 Workspace 的 `cwd` 和必要上下文。
- Desktop 在新建 Session 时展示 Agent 选择器，首期提供 `Zotigo` 和 `Codex`。
- Agent backend 在 Session 创建后不可原地替换。产品提供“Continue with another Agent”，通过 handoff 创建同一 Workspace 下的关联 Session，避免两个 runtime 争夺同一份历史。
- 同一 backend 内允许切换执行配置：Zotigo Session 可以切 profile，Codex Session 可以切 model/reasoning；这类切换继续使用原 Session 和原生上下文。
- zotigod 的 Session ID 是所有客户端看到的稳定 ID；Codex thread ID 只作为内部 binding 持久化。
- Desktop 继续只依赖 zotigod 的公开 HTTP/SSE。Codex 的 JSON-RPC、UDS、登录状态和 thread 生命周期由 zotigod 封装。
- 首期复用用户现有 Codex 登录和订阅，不读取、复制或反代 Codex token。
- 首期仅支持 macOS；zotigod 只从自身 `PATH` 检测 `codex`。未检测到时，Desktop 不展示 Codex，也不提供 binary path 配置。
- Codex 首版必须支持选择具体 model 和 reasoning effort；可选值来自 app-server `model/list`，不是 Desktop 硬编码。
- 创建 Codex Session 时，不创建、复用或修改 Codex local Project；`thread/start` / `thread/resume` 使用完整 Workspace 根目录作为 `cwd`，thread ID 作为内部 binding 持久化。
- runtime 接入通过 zotigod 内部的窄 interface 完成；Codex、Zotigo native 以及后续 pi、Claude Code adapter 共享命令和事件语义，不共享 backend 私有协议。
- `initialize.clientInfo.name` 首期固定为 `zotigod`。
- 不使用 TCP `ws://` 作为 Zotigo 的默认集成面。当前 Codex 源码仍将该 transport 标为 experimental / unsupported，而 UDS 明确用于本地 control-plane client。

## 2. 要解决的问题

Zotigo 已经拥有 Project、Workspace、Session、持久化 display log 和 Desktop API。如果 Desktop 再直接管理 Codex thread，会出现两套会话状态：

- Desktop 要同时保存 zotigod Session ID 和 Codex thread ID；
- 飞书、CLI 或未来其他客户端无法复用 Desktop 内的 binding；
- Desktop 退出后 Codex session 的恢复、审批和流式事件没有稳定 owner；
- 一个 Workspace 下接入 Claude Code 等其他 Agent 时，每个客户端都要重新实现 backend 协议。

因此 backend 接入必须落在 zotigod，Desktop 只表达“这个 Session 使用哪个 Agent”。

## 3. 范围

本方案覆盖：

- zotigod 管理 `codex app-server` 本地进程和 UDS；
- Codex thread 与 zotigod Session 的绑定；
- 消息、steering、interrupt、approval 和事件的协议适配；
- Desktop 的 Agent 发现和选择；
- Codex 登录状态的只读展示；
- Codex 额度状态、重置时间和额度耗尽后的恢复选择；
- Codex 与其他 Agent 之间的显式 Session handoff；
- Workspace `cwd` 与 Codex thread binding 的创建和恢复；
- 可注入、可替换的 runtime adapter 边界，供测试和后续 pi、Claude Code 等 runtime 接入。

首期不做：

- Desktop 直连 Codex UDS；
- 通过反向代理调用 ChatGPT/Codex 私有接口；
- 在 Zotigo 和 Codex backend 之间迁移同一个 Session 的完整历史；
- 额度恢复后自动重放失败 turn；
- 未经用户确认自动切换到另一个账号、Agent 或付费方式；
- 在 Zotigo 内复制 Codex OAuth token；
- 暴露全部 app-server API；
- 直接依赖 Codex experimental `runtimeWorkspaceRoots`。

## 4. 所有权和 source of truth

| 数据 | owner | 说明 |
|---|---|---|
| Project / Workspace / checkout | zotigod | Codex 不创建或删除 Zotigo Workspace |
| Codex local Project | Codex Desktop / 用户 | Zotigo 首版不创建、不改绑，也不依赖其作为导航或执行边界 |
| 对外 Session ID、标题、pin、归档状态 | zotigod | Desktop、飞书和其他客户端使用同一个 ID |
| Session 使用的 Agent backend | zotigod | 创建后不可变 |
| Session lineage / handoff | zotigod | 记录来源 Session、目标 Agent 和切换原因 |
| Codex thread 和模型上下文 | `codex app-server` | 通过 Codex thread ID 恢复 |
| Session backend binding | zotigod | 保存 zotigod Session ID 到 Codex thread ID 的映射 |
| Desktop display log | zotigod | 保存归一化、可分页的展示记录 |
| Codex 登录和订阅状态 | Codex | zotigod 只通过 `account/read` 读取状态 |
| Codex credentials | Codex | 使用用户现有 `CODEX_HOME`，Zotigo 不解析凭据文件 |

Codex-backed Session 的语义历史以 Codex thread 为准，Desktop 展示以 zotigod display log 为准。display log 必须能通过 Codex thread item ID 去重，并可在 worker 重连后从 `thread/read` 或 `thread/resume` 返回的历史补齐。

## 5. Runtime interface

Codex 接入必须位于可注入的 runtime interface 后面，原因有两个：daemon 编排测试不能依赖真实 Codex binary；后续 pi、Claude Code 等 runtime 不应重复实现 discovery 和 worker launch。但 interface 必须放在现有真实替换点，不能另建一套 Session 执行通道。

现有三条边界保持不变：

1. Desktop 和其他客户端使用 zotigod public HTTP/SSE；
2. daemon 通过 internal worker WebSocket 投递 message、steering、interrupt 和 approval command；
3. worker 将结果归一化成 durable display item 和 live delta。

daemon 侧首期只增加一个窄 interface：

```go
type RuntimeAdapter interface {
	Kind() AgentKind
	Probe(context.Context, RuntimeProbeRequest) (RuntimeCapabilities, error)
	StartWorker(context.Context, WorkerLaunchSpec) error
}

type WorkerLaunchSpec struct {
	SessionID                 string
	Agent                     AgentKind
	WorkingDirectory          string
	SessionBinding            *BackendBinding
	Settings                  RuntimeSettings
}
```

`RuntimeAdapter` 负责 capability probe 和启动对应 worker。native adapter 包装现有 `WorkerLauncher`，Codex adapter 确保共享 app-server host 可用后启动 bridge worker；pi、Claude Code 后续各自启动自己的 worker。adapter 是 daemon 进程内对象，不跨进程传递。

Session message、steering、interrupt、approval、display item 和 live delta 继续完全使用现有 internal worker WebSocket protocol。Codex bridge worker把该 protocol 翻译成 app-server JSON-RPC；不新增 daemon 持有的 `RuntimeSession`、第二套 event channel 或第二个背压 owner。

worker generation 继续沿用现有 attach 流程：worker 完成 internal WebSocket Upgrade 后，由 daemon 生成 opaque generation 并通过现有 response header 返回；它不是 `WorkerLaunchSpec` 的输入。bridge worker 创建新的 backend conversation 后，通过当前连接发送 backend-neutral 的 `conversation_bound(conversation_id)` control message。daemon 使用连接关联的 generation 和 Session lock 按以下规则处理，`BackendBinding.Agent` 始终从不可变的 Zotigo Session metadata 派生，不接受 worker提供的 Agent：

- 当前连接 generation 不是 Session registry 中的 generation：返回 `stale_worker`，不写 binding，发送方退出；
- 当前 binding 为空：CAS `nil → (agent, conversation_id)`，durable commit 后 ack；
- 已绑定同一个 `(agent, conversation_id)`：视为 ack 丢失后的幂等重放，直接 ack；
- 已绑定不同 conversation：返回 `backend_binding_conflict`，保留原 binding，发送方退出并把 Session 置为 `paused`，绝不覆盖。

worker 未收到成功 ack 前不能调用可能产生副作用的 `turn/start`。崩溃恰好发生在 `thread/start` 成功而 control message 发出前时，会留下无 turn 的孤儿 Codex thread；首期不通过 `cwd + 时间` 猜测认领。

公共 `WorkerLaunchSpec` 由 core 构造，只传 backend-neutral 的 working directory、已持久化 Session binding 和 settings 等启动前已知快照，不能传 daemon 内对象、worker generation 或 Codex socket。`CodexAdapter.StartWorker` 从私有 `CodexHostManager` 取得已验证的 socket/app-server instance identity，再转换成 adapter-private `CodexWorkerLaunchSpec` 或子进程参数；core、registry 和 native adapter不感知 Codex transport。worker 内部 backend client、process protocol 和 JSON-RPC DTO 不属于通用 interface。

归一化事件只包含 zotigod 能稳定持久化或展示的内容，例如：

- turn started / completed / failed / interrupted；
- assistant text delta 和 completed message；
- command、file change、tool result；
- approval requested / resolved；
- backend disconnected / reconnected。

backend-specific 能力通过 adapter 的动态 `Probe` 返回并写入 catalog。例如首期 Codex 支持 model，现有 Zotigo backend 使用 profile。command handler 在投递前按 catalog 拒绝不支持的操作；registry 不用尚未创建的 Session 对象做 type assertion。

测试分两层：daemon orchestration 使用 fake `RuntimeAdapter` 和现有 fake worker 验证路由、Session binding、幂等和错误映射；Codex adapter/bridge 使用 fake app-server 验证 UDS、JSON-RPC 和 worker event 翻译。后续 runtime 复用 interface，但 transport、登录和模型发现仍留在各自 adapter 内；只有出现第二份真实重复代码后才提取 process/JSON-RPC helper。

## 6. 进程和 UDS 生命周期

### 6.1 进程模型

一个 zotigod 进程最多管理一个共享的 `codex app-server` 子进程。多个 Codex Session 各自运行轻量 bridge worker，并通过同一个 UDS 连接 app-server：

- app-server 负责多个 Codex thread；
- bridge worker 继续复用 zotigod 现有的 session lock、command、approval 和 display-log 流程；
- 一个 zotigod Session 同时最多有一个 bridge worker，避免同一 Codex thread 被重复 resume 或重复消费事件。

`CodexHostManager` 在第一个 Codex Session 启动或显式 prepare 时懒启动 app-server。普通 `GET /agents` 只返回 binary discovery 和最近一次 probe cache，不能因为读取 catalog 隐式拉起子进程。首期启动后保持到 zotigod 退出，不增加 idle timeout。

### 6.2 Socket 位置

使用 Zotigo 自己的短路径，不占用 Codex 默认 control socket：

```text
~/.zotigo/run/<daemon-short-id>/codex.sock
```

要求：

- runtime 目录权限为 `0700`；
- 路径长度在启动前校验，避免 macOS UDS 长度限制；
- 每个 daemon instance 使用不同目录，避免并行 daemon 误连；
- 只清理由当前 daemon 创建并确认归属的 socket；
- daemon 异常退出留下的目录，在确认记录的 PID 已不存在后才能清理；
- app-server stdout/stderr 写入 Zotigo runtime log，不混入 JSON-RPC 数据流。

启动命令：

```text
<codex-bin> app-server --listen unix://<absolute-socket-path>
```

UDS 内仍然使用标准 WebSocket HTTP Upgrade 和 text frame，每个 frame 是一个 app-server JSON-RPC message。

### 6.3 Binary 和版本

首期仅支持 macOS。zotigod 使用 `exec.LookPath("codex")` 从自身 `PATH` 检测 binary，不接受 binary path 配置，不扫描固定安装目录，也不负责安装或升级 Codex。未检测到时，`GET /agents` 直接省略 Codex entry，Desktop 因此不展示 Codex；这不影响 Zotigo backend。

从 Finder 启动与从 shell 启动时的 `PATH` 可能不同。首期把 zotigod 实际继承到的 `PATH` 视为唯一检测边界；诊断日志可以记录“未找到 codex”和脱敏后的搜索目录，但产品界面不增加路径选择器。

启动后记录 `codex --version`，并完成 `initialize` 握手。首期只维护实际使用的 JSON-RPC DTO 子集，解码时允许未知字段，并在 CI 中用目标 Codex 版本生成的 schema 做兼容测试；不在用户机器上动态生成代码。最低支持版本在实现前根据首个可发布版本确定。遇到缺失方法或不兼容返回时，将 Codex 标为 `incompatible`，不能静默降级成 Zotigo backend。

`initialize.clientInfo.name` 使用稳定的 `zotigod`，不能伪装成 Codex Desktop 或 VS Code。面向企业发布前，需要按 app-server README 的说明确认该 client name 是否应加入 OpenAI compliance logs 的已知客户端列表；这不阻塞首版本地接入。

## 7. Session 和 Codex thread 映射

### 7.1 持久化字段

建议给 core Session metadata 增加：

```go
type AgentKind string

const (
	AgentZotigo AgentKind = "zotigo"
	AgentCodex  AgentKind = "codex"
)

type BackendBinding struct {
	Agent          AgentKind `json:"agent"`
	ConversationID string    `json:"conversation_id,omitempty"`
	BackendVersion string    `json:"backend_version,omitempty"`
}
```

兼容规则：历史 Session 没有 `agent` 时按 `zotigo` 读取。Codex thread ID 保存到 `conversation_id`，不暴露为 Desktop 的导航 ID。历史版本已经写入的 runtime workspace binding 表和 Codex Project 不删除、不迁移；新 Session 不读取或新增这些 binding。

仅增加 `agent` 字段不足以保证 binary rollback 安全：旧 zotigod 会忽略未知 JSON 字段，并可能把 Codex Session 当 native Session 启动。Codex Session 同时把 legacy `profile_name` 写成保留哨兵 `__zotigo_backend__:codex`；新版本禁止用户 profile 使用 `__zotigo_backend__:` 前缀，并在 Codex path 忽略该 legacy profile。回滚到旧版本时，profile resolution 会 fail closed，而不是使用默认 native profile。正式实现前必须用当前可回滚版本验证这条行为。

跨 Agent handoff 还需要在 Zotigo Session metadata 保存：

```go
ParentSessionID string `json:"parent_session_id,omitempty"`
HandoffReason   string `json:"handoff_reason,omitempty"`
```

它们只表达 Zotigo Session lineage，不把 Codex thread 和 Zotigo native history 合并成同一个 runtime history。

display item 增加可选的 backend identity：

```go
BackendAgent  string `json:"backend_agent,omitempty"`
BackendItemID string `json:"backend_item_id,omitempty"`
```

同一个 `(session_id, backend_agent, backend_item_id)` 只能落一次 completed item，用于重连补历史时去重。

当前 FileStore 已有跨进程 display-log append lock 和条件追加能力。正常 live stream 由单 worker 顺序追加；恢复时先加载已有 backend item key 集合，再通过条件追加补缺失项。不能仅在内存里去重，也不能为每个 delta 全量扫描历史。

### 7.2 创建与恢复

`POST /sessions` 只创建 zotigod Session，不立即创建 Codex thread。之后分两种情况：

1. `POST /sessions/{id}/start` 为 Session 和 Workspace 加锁，用 Workspace 根目录构造 `WorkerLaunchSpec.WorkingDirectory`，随后调用 `RuntimeAdapter.StartWorker`。worker 连接 UDS，执行 `initialize` / `initialized`；已有 Session binding 时调用带 `cwd` 的 `thread/resume`，没有 binding 时只完成预热，不创建空 thread。
2. 第一条消息到达且 Session binding 为空时，worker 调用只带 `cwd`、model 和 approval policy 的 `thread/start`，不传 `projectId`。收到 thread ID 后发送 `conversation_bound`；daemon CAS 持久化并 ack 后，worker才调用 `turn/start`。已有 binding 时直接调用 `turn/start`。

Codex 新 thread 在首个 turn 前不保证已经持久化，因此不能让 zotigod 长期保存一个仅由 pre-warm 创建的空 thread ID。worker ready 表示 backend 连接可用，不表示 Codex thread 已经 materialize。

app-server 成功创建 thread、但 zotigod 在 binding 落盘前崩溃，仍可能留下一个未绑定 Codex thread。首期将其视为可接受的本地孤儿记录，不根据 `cwd + 时间` 猜测绑定；后续可以通过 Codex thread import/reconcile 工具人工认领。

`turn/start.clientUserMessageId` 用于对账，不视为 app-server 的幂等键。发送前，worker 先持久化 Zotigo message command；如果连接在 response 前断开，worker 不盲目重发，而是在 `thread/resume` 的 history 中查找相同 `clientId`：

- 已存在：将原 command 标记为已接受并继续消费对应 turn；
- 明确不存在且 thread idle：才允许重发；
- history 不完整、thread 仍 active 或状态不确定：将 Session 置为 `paused`，要求恢复流程或用户确认。

`turn/steer` 使用同一规则。这样可以避免“请求已被 Codex 接受，但 Zotigo 没收到 response”时创建重复 turn 或重复 steering message。

Zotigo 使用用户现有 `CODEX_HOME`，使 Codex app-server 能恢复 thread；但是否在 Codex Desktop 的“最近”或 Project 分组中显示，不属于首期契约。当前 Codex 源码没有跨 app-server process 的 thread ownership lease，`thread/resume` 也不承诺在另一个 host 已打开同一 thread 时返回 conflict。Zotigo 的 Session lock 只能约束自己的 worker，不能阻止 Codex Desktop、CLI 或另一 app-server 同时 resume/write 同一 rollout。

因此首版明确不支持同一个 Zotigo-managed Codex thread 被另一个 Codex host 同时执行。用户在 Zotigo Session active/paused 期间不应从 Codex Desktop 对该 thread继续发送消息。不能把这条限制包装成可自动检测的 `backend_in_use` 状态。

发布前必须执行两个共享 `CODEX_HOME` 的真实 app-server E2E，记录同时 resume、并发 turn、rollout append 和后续恢复的实际结果。在 Codex 提供跨 host lease 或 Zotigo 改为复用同一个 host 前，该限制保留在 Experimental 风险说明中。

### 7.3 Workspace 上下文

`thread/start.cwd` 使用完整 Workspace 根目录，与 Zotigo Session 的既有 cwd 契约一致。这样 Codex 默认可以访问 `code/` 中的多个 repository、`notes/` 中的知识资料、`artifacts/` 中的产物，以及 Workspace 根目录的说明文件。Workspace 根目录本身未必是 Git repository，因此附加的 developer instructions 应明确：

- primary repository 的绝对路径；
- 当前 Workspace 包含的 repository 路径；
- Git 命令需要在具体 repo 目录执行，或使用 `git -C`。

### 7.4 Codex Project 边界

Codex Project 是 Codex Desktop 的本地组织对象，但 app-server 的 SQLite `project/*` / `projectId` 数据不会自动进入已安装 Desktop 当前使用的 sidebar Project atom。继续写入只会产生第二套不可见的 Project 状态和额外恢复协议，因此首版明确不接入：

- capability probe 不要求或声明 Project 能力；
- `POST /sessions`、`/start` 和第一条消息都不调用 `project/list`、`project/read` 或 `project/create`；
- `thread/start` 不传 `projectId`，`thread/resume` 不读取或修复 `thread.projectId`；
- Workspace 名只属于 Zotigo catalog，不用于创建 Codex Project；实际上下文与执行边界由绝对 `cwd = <workspace-root>` 决定；
- 历史版本创建的 Codex Project 和 zotigod runtime workspace binding 保留原样，但新链路不读取、更新或删除它们。

以后只有在 Codex 提供能稳定写入 Desktop 实际 Project/Sidebar source of truth 的公开能力，并完成同进程/跨进程可见性与生命周期验证后，才重新评估 Project 映射。该能力应作为独立可选集成，不得成为 Codex runtime 的启动前置条件。

## 8. 协议映射

| Zotigo 动作 | Codex app-server | 备注 |
|---|---|---|
| start new session | `thread/start` | 传 Workspace 根目录的 `cwd`，返回 thread ID 并持久化 binding |
| resume session | `thread/resume` | 传相同 `cwd`，用于 worker 重启或 offline session 恢复 |
| send message | `turn/start` | `clientUserMessageId` 使用 Zotigo display item ID |
| steering | `turn/steer` | 仅 active turn 可用；错误映射为稳定 Zotigo code |
| pause / interrupt | `turn/interrupt` | 等待 `turn/completed: interrupted` 后更新状态 |
| command approval | JSON-RPC response to `item/commandExecution/requestApproval` | 保留 app-server request ID 直到用户决定 |
| file approval | JSON-RPC response to `item/fileChange/requestApproval` | 统一映射到 Zotigo approval item |
| permission approval | JSON-RPC response to `item/permissions/requestApproval` | 首期按 capability 决定是否展示 |
| assistant streaming | `item/agentMessage/delta` | 通过现有 SSE 发送 delta |
| durable item | `item/completed` | 归一化后写 display log |
| turn end | `turn/completed` | 映射 completed / interrupted / failed |
| models | `model/list` | 供 Codex Agent 的设置 UI 使用 |
| auth status | `account/read` | 不向 Desktop 返回 token 或默认返回 email |
| usage snapshot | `account/rateLimits/read` | 读取使用比例、重置时间和已触达的限制类型 |
| usage update | `account/rateLimits/updated` | 稀疏更新，需要和最近一次 snapshot 合并 |

审批响应不能被建模成另一个 app-server method。它是对 server-initiated JSON-RPC request 的 response；bridge worker 必须保存 request ID，并将 Zotigo approval ID 映射到该 request ID。

同一个 app-server process 内，pending server request 会在新连接重新订阅 thread 时 replay。bridge worker 应根据 `(thread_id, request_id, method)` 生成稳定 approval identity；重连收到 replay 时复用已有 Zotigo approval item。只有收到 app-server response acceptance 或后续 terminal item 后，才追加最终 approval decision。

app-server process 重启后，旧 request ID 不再有效。恢复时若 Codex history 将原 turn 标为 interrupted/failed，Zotigo 关闭对应 pending approval 并追加 interruption；若状态仍无法确定，则保持 paused 并要求人工确认，不能把旧 decision 发到新进程。

## 9. 权限映射

首期沿用 Desktop 已有的两个入口，但在 adapter 内做明确映射：

| Zotigo policy | Codex approval | Codex sandbox | Desktop 文案 |
|---|---|---|---|
| `auto` | `on-request` | `workspaceWrite` | Auto / Default |
| `bypass_permissions` | `never` | `dangerFullAccess` | Full access |

`bypass_permissions` 必须继续使用危险态确认。不能只把 approval 设置成 `never` 而保留一个含糊的 sandbox，也不能把 Codex managed requirements 拒绝的权限静默提升。

后续如果要支持 Codex permission profiles，应新增可发现的 capability 和设置入口，不修改上述旧值的含义。

## 10. 模型切换、Agent handoff 和额度耗尽

“切换”分为三类，不能共用一个含糊的后端字段更新：

| 用户动作 | 是否保留原 Session | 实现 |
|---|---|---|
| Zotigo profile / provider 切换 | 是 | 继续使用现有 `PUT /sessions/{id}/profile` 和 Zotigo normalized history |
| Codex model / reasoning 切换 | 是 | 持久化到 Zotigo Session settings，并在下一次 `turn/start` 提交 override |
| Codex 与 Zotigo、Claude Code 等 Agent 互换 | 否 | 创建关联 Session，并把必要上下文作为 handoff package 交给目标 Agent |

### 10.1 为什么跨 Agent 不原地切换

Codex thread 的上下文、tool item、approval request 和恢复状态由 app-server 管理；Zotigo native Session 则保存自己的 snapshot、turn 和 provider 状态。直接修改同一 Session 的 `agent` 会产生无法回答的问题：

- 新 backend 应从哪一条历史继续；
- 未完成 tool call 和 pending approval 属于谁；
- 切回 Codex 时使用原 thread，还是把中间新增的对话硬塞回原 thread；
- display log 与 backend history 不一致时哪个可以重放。

因此 UI 可以叫“切换 Agent”，底层语义必须是 handoff。原 Session 保留并可恢复，新 Session 共享同一个 Workspace，文件改动天然可见。

### 10.2 Handoff package

目标 Session 首次启动前，zotigod 从 source Session 的可见、已完成数据生成一个确定性、有上限的 handoff package。首版默认边界为：

- 原 Session ID、来源 Agent、handoff 原因；
- 最近 8 条已完成 user message，最新一条用户消息始终保留并具有最高裁剪优先级；
- 最近 2 条已完成 assistant final message，按原对话顺序穿插；
- 消息文本总上限 16 KiB，超限时先删除更早的 assistant message，再从最早的 user message 开始裁剪；
- Workspace 根目录、当前工作目录、primary repository 和 repository paths；
- 当前 Session 中由用户附件、已完成 tool result 或 file-change item 明确引用的文件路径；
- 当前未提交文件列表和最近一次已完成测试的名称与结果；这些内容由 zotigod 从磁盘与结构化 display item 确定，不调用 source Agent 重新总结。

目录只传稳定路径引用，不递归复制目录内容；普通 Workspace 文件也不塞进消息文本。目标 Agent 已在同一个 Workspace 中运行，应读取磁盘上的最新状态。Workspace 外的附件只有在文件仍存在、目标 Agent 可访问且用户确认 handoff 时才传路径；首版不自动复制附件到新的存储位置。

这里的“Session 文件”指该 Session 中明确引用、附加或修改的工作文件，不是 Codex 的原生 rollout/session 持久化文件。Codex 原生 session 继续由 app-server 和 binding 管理；其他 Agent 不应读取或解析它。

不传递内部 reasoning、raw credential、未决 approval request 或无法确认是否完成的 tool result。目标 Agent 仍应检查当前 Workspace 文件和 Git 状态，不能只相信摘要。

handoff 前要求 source turn 已 terminal，或者先由用户明确 interrupt。确认界面至少展示目标 Agent/provider、消息数量和将共享的 Workspace/附件路径；不要求用户逐字编辑 package。不能依赖额度已经耗尽的 source Agent 再生成摘要。

### 10.3 额度状态

CodexHostManager 缓存 `account/rateLimits/read` 的完整 snapshot，并按 app-server 要求合并 `account/rateLimits/updated` 的稀疏更新。对 Desktop 只暴露归一化字段：

```json
{
  "state": "available",
  "used_percent": 82,
  "resets_at": 1787317200,
  "reached_type": null,
  "reset_credits_available": 0
}
```

`state` 首期包括 `available`、`limited` 和 `unknown`。`resets_at` 是服务端提供的 Unix timestamp；缺失时不能自行估算。reset credit 只展示可用数量，消费 credit 必须是单独的用户确认动作，不能由 retry 或 Agent handoff 隐式触发。

app-server 将 `account/rateLimits/read` 定义为 ChatGPT rate limits。只有 `account/read` 确认当前 auth mode 为 `chatgpt`，并且 rate-limit request 成功时，Zotigo 才报告 `available` 或 `limited`；API key、Bedrock、缺失字段或请求失败均报告 `unknown`，不能套用 ChatGPT 的重置时间。

只有 CodexHostManager 的 control connection 消费 account/rate-limit global notifications。每个 Session bridge 在 `initialize` 中通过 exact notification opt-out 关闭不需要的 global notification，避免多个 worker 重复更新同一份 usage cache。

Zotigo profiles 使用不同 provider，其额度接口并不统一。能读取官方 usage API 的 adapter 可以填充同一 DTO；只能从请求错误判断的 provider 将状态标为 `unknown`，并在实际命中限制后报告 `limited`，不能伪造剩余额度。

### 10.4 额度耗尽后的行为

Codex turn 命中 hard usage limit 后：

1. 将 Session 置为 `paused`，附加 `pause_reason: "usage_limited"`、可用的 `resets_at` 和稳定错误码；
2. 保留原 Codex thread 和 binding，不把 Session 标记为永久失败；
3. Desktop 展示三个明确选择：等待额度恢复后重试、切换可用的 Codex model、Continue with another Agent；
4. 切换 Codex model 只有在 model catalog 和 rate-limit 信息能证明其可用，或用户明确愿意尝试时才执行，不能承诺一定绕过额度；
5. Continue with another Agent 创建 handoff Session，原 Codex Session 仍可在额度恢复后继续。

收到 `account/rateLimits/updated` 或到达 `resets_at` 后，zotigod 重新执行 `account/rateLimits/read` 并更新 catalog。额度恢复不会自动重放失败 turn；用户点击 Retry 或发送新消息后才恢复。原因是失败前可能已执行命令或修改文件，自动重放会产生重复副作用。

Codex model/reasoning 的目标值由 zotigod Session metadata 持久化，并在后续每次 `turn/start` 中显式传递。首期不调用 experimental `thread/settings/update`，避免用户更新 Codex binary 后依赖一个尚无稳定承诺的设置接口。

如果用户已通过 handoff 在另一个 Agent 中继续，之后回到 Codex 有两种动作：

- Resume original Codex Session：继续原 thread，不自动包含离开期间的对话；
- Continue back with Codex：从当前 Session 再创建一个 Codex handoff Session，把离开期间的可见进展作为新上下文。

首期不自动把两个分支合并到原 Codex thread。

## 11. zotigod 公开 API

### 11.1 Agent catalog

新增：

```http
GET /agents?working_directory=<workspace-code-path>
```

该接口不启动 app-server。Codex 尚未 probe 时可以返回 `availability: "installed"`、`auth_mode: null`、`usage.state: "unknown"`。

显式准备 Codex：

```http
POST /agents/codex/prepare
```

该操作允许启动 app-server，执行 `initialize`、`account/read`、`model/list` 和适用时的 `account/rateLimits/read`，然后返回更新后的 Codex catalog entry。并发 prepare 必须合并为一次启动。Project API 不属于首版 capability，也不影响兼容判断。

示例：

```json
{
  "default_agent": "zotigo",
  "agents": [
    {
      "id": "zotigo",
      "label": "Zotigo",
      "availability": "available",
      "capabilities": {
        "profiles": true,
        "models": false,
        "steering": true,
        "approvals": true
      }
    },
    {
      "id": "codex",
      "label": "Codex",
      "availability": "available",
      "version": "codex-cli 0.x.y",
      "auth_mode": "chatgpt",
      "plan_type": "pro",
      "usage": {
        "state": "available",
        "used_percent": 25,
        "resets_at": 1787317200,
        "reached_type": null
      },
      "capabilities": {
        "profiles": false,
        "models": true,
        "steering": true,
        "approvals": false
      }
    }
  ]
}
```

Codex entry 已经存在时，`availability` 至少包括：

- `installed`；
- `available`；
- `not_authenticated`；
- `incompatible`；
- `unhealthy`。

未检测到 `codex` 时不返回 Codex entry，不使用 `not_installed` 占位。

Agent catalog 是展示 DTO，不返回 Codex token、credential path 或完整账户信息。

prepare 成功后的 Codex entry 同时返回归一化 model catalog。每个 model 至少包含稳定 `id`、`display_name`、`is_default` 和按服务端顺序排列的 `supported_reasoning_efforts`；Desktop 不自行猜测某个 model 支持哪些 effort，也不把截图中的示例名称写死。

### 11.2 创建 Session

扩展现有请求：

```json
{
  "workspace_id": "ws_...",
  "working_directory": "/Users/me/.zotigo/projects/.../code",
  "agent": "codex",
  "model": "gpt-5.6-sol",
  "reasoning_effort": "high",
  "approval_policy": "auto"
}
```

兼容规则：

- 缺少 `agent` 时默认 `zotigo`；
- `profile` 只适用于 `zotigo`；
- `model` 和 `reasoning_effort` 只适用于 `codex`；
- 传入不适用于所选 Agent 的字段时返回 `400 invalid_request`，不能静默忽略；
- Session 响应增加 `agent`，Codex Session 可增加非敏感的 `model` 和 `reasoning_effort`。

首期继续复用现有 message、steering、pause、approval、items 和 events endpoint。Desktop 不需要知道后端是 HTTP worker 还是 app-server JSON-RPC。

创建请求先持久化 Zotigo Session；后续 `/start` 校验 Workspace 可用并以 `code/` 为 working directory 启动 worker。协议缺失返回 `agent_incompatible`，app-server 启动或连接失败返回 `backend_unavailable`。失败不创建 Codex thread；重试 `/start` 继续使用同一个 Zotigo Session。

### 11.3 更新 Codex 执行设置

新增窄接口：

```http
PUT /sessions/{id}/codex-settings
```

```json
{
  "model": "gpt-5.6-sol",
  "reasoning_effort": "high"
}
```

该接口只接受 `agent = codex` 的 Session，并按当前 catalog 原子校验 model 与 reasoning effort 的组合。成功后写入 Zotigo Session metadata，返回更新后的 Session；不直接调用 experimental `thread/settings/update`。若当前 turn 正在运行，新设置仅供下一次 `turn/start` 使用。非法组合返回 `400 invalid_request`，Session 原设置保持不变。

### 11.4 Agent handoff

新增：

```http
POST /sessions/{id}/handoff
```

```json
{
  "target_agent": "zotigo",
  "profile": "claude-sonnet",
  "reason": "usage_limited",
  "approval_policy": "auto"
}
```

服务端校验 source Session 已 terminal 或 paused、目标 Agent 可用、Workspace 仍存在，然后创建带 `parent_session_id` 的目标 Session 和 handoff display item。客户端必须提供 `Idempotency-Key`，服务端生成稳定 `handoff_id`。

当前 FileStore 不能跨 session file 和两个 display log 做真正的原子事务，因此实现不能声称“原子创建”。阶段 4 必须二选一：

1. 增加可恢复的 handoff operation journal，按 `intent → target_created → markers_appended → completed` 推进；
2. 将 handoff binding 和 lineage 放入已有 SQLite catalog，用唯一约束和事务创建，再把 display item 视为可补写投影。

无论选择哪种方式，重复请求返回同一个 target Session；中途失败由同一个 `handoff_id` 继续，不修改或删除 source Session。

## 12. Desktop 交互

### 12.1 新建 Session

在 Workspace 的 New Session composer 中增加 Agent 选择器：

```text
Agent: [ Zotigo ▾ ]
       ├─ Zotigo
       └─ Codex
```

交互规则：

- 默认值来自 `GET /agents.default_agent`；
- 记住“这个 Workspace 最近一次选择”，但不悄悄修改全局默认；
- 选择 Zotigo 时展示现有 Profile 选择；
- `GET /agents` 没有 Codex entry 时完全不展示 Codex；检测到 binary 后才展示；
- 选择 Codex 时，首版必须同时展示具体 Model 和推理强度选择。列表和默认值来自 prepare 后的 `model/list`，提交时使用稳定 model ID 与 reasoning effort ID；
- Codex 已检测但 `not_authenticated`、`incompatible` 或 `unhealthy` 时可以展示但不能创建 Session，并给出对应状态；首版未登录只提示用户在 Codex 中完成登录；
- Session 创建后在 header 显示 Agent badge；Agent 菜单中的跨 Agent 操作显示为“Continue with…”，并明确会创建关联 Session；
- fork Session 默认继承 Agent。跨 Agent handoff 不继承完整 backend history，只传递经过确认的 handoff package。

Codex 配置入口参考图 1 的层级与密度，但使用 Zotigo 设计 token，不复制截图资源：

```text
Composer control: [ 5.6 Sol · 中  ▾ ]

Popover
  模型       5.6 Sol  ›
  推理强度   中       ›
```

- 胶囊放在 composer 底部控制区，点击后向上打开紧凑浮层；
- “模型”和“推理强度”各自进入单选子菜单，当前值右对齐；
- reasoning effort 按 `model/list.supportedReasoningEfforts` 返回顺序展示，并用本地化标签显示，提交时保留原始 ID；
- 图 1 中的“速度”不进入首版，因为当前需求只包含 model 和 reasoning，且不能把未统一的服务档位误当作通用 Codex 能力；
- 新建 Session 时先选择 Agent；Codex 被选中并 prepare 成功后才启用该胶囊。已创建的 Codex Session 可以修改 model/reasoning，修改只作用于下一次 `turn/start`；
- 若当前 turn 正在运行，菜单仍可查看但保存值标记为“下一轮生效”，不修改进行中的 turn。

### 12.2 登录

第一阶段复用用户已有 Codex 登录：

- `account/read` 返回已登录时允许创建；
- 未登录时提示用户先运行 Codex 登录或打开 Codex；
- Zotigo 不读取 credentials 文件，也不要求 API key。

首版不接入 `account/login/start`，也不在 Zotigo 内发起登录。未来若单独立项，才通过 zotigod 的窄 API 驱动官方 ChatGPT browser/device-code flow，Desktop 仍不接触 token。

### 12.3 额度提示和恢复

普通状态只在 Agent picker 或设置面板展示简洁用量，不持续打扰。达到阈值或 hard limit 时，在当前 Session 内展示 banner：

```text
Codex usage limit reached · Resets at 18:30
[Retry after reset] [Try another Codex model] [Continue with another Agent]
```

“Retry after reset”首期表示保留 Session 并在 reset 后允许用户一键重试，不创建自动后台任务。若以后增加自动 retry，必须单独设计幂等和副作用判定。

## 13. 断线、重启和数据一致性

### app-server 退出

- `CodexHostManager` 将所有受影响的 Codex Session 标记为 `offline`，而不是 `failed`；
- 当前 turn 若没有收到 terminal event，追加明确的 interruption/error 展示项；
- 下一次 start/message 重启 app-server，并使用已持久化 thread ID 执行 `thread/resume`；
- 自动重启使用带 jitter 的有限退避，不能形成紧密拉起循环。
- app-server 返回 overload `-32001` 时只重试可证明尚未被接受的 read/probe request；`turn/start`、`turn/steer` 和 approval response 先走上述对账流程。

正常 shutdown 时 zotigod 终止自己启动的 app-server 并清理 socket。daemon 崩溃后，新进程先连接并验证 Zotigo runtime record 指向的旧 socket：健康且版本兼容时可以接管；连接失败时才隔离旧 runtime directory 并启动新 host。不能仅凭 PID 执行 kill，因为 PID 可能复用；身份无法确认时宁可隔离并报告 stale host，也不结束未知进程。

### bridge worker 退出

- 复用现有 session lock 和 worker replacement；
- 新 worker 连接同一个 UDS 并 resume thread；
- 用 Codex item ID 对 display log 去重；
- 未完成 turn 的最终状态以 app-server 恢复结果为准，不能仅凭 WebSocket 断开判断失败。

### Desktop 退出或多个 Desktop 连接

不影响 Codex runtime。Desktop 重新打开后从 zotigod `items` 读取历史，从 SSE 订阅增量。多个 Desktop 客户端也只连接 zotigod，不分别 resume 同一个 Codex thread。

### daemon 重启

- app-server 由新 daemon instance 重新启动；
- persisted binding 保留；
- Codex Session 初始显示 `offline`；
- 显式 start 或发送消息时恢复；
- 不在 daemon 启动时一次性 resume 全部历史 Session。

## 14. 安全边界

- UDS runtime 目录只允许当前用户访问；
- Desktop renderer 不获得 socket path，也不获得任意 JSON-RPC 透传接口；
- zotigod 不返回 Codex credentials、refresh token 或 app-server 原始 account payload；
- 远程 Desktop 连接 zotigod 时，Codex UDS 仍只存在 daemon 所在机器；
- 对外网络安全继续由 zotigod bearer token 与可信网络/HTTPS 负责；
- 不允许通过公共 API 传入任意 app-server method、任意 executable 或任意 socket path；
- runtime adapter 不调用 `project/*`，renderer 也没有 Project mutation 入口；
- model、reasoning 和 approval 值必须来自 capability catalog 或服务端校验；
- Codex binary 更新可能改变协议，启动握手和兼容错误必须可观测。
- 首版产品范围仅为 macOS 本地 UDS；Linux 和 Windows 不在兼容性承诺内。
- 跨 provider handoff 前必须展示目标 Agent/provider；不能因为额度耗尽就把 conversation 和 Workspace 内容静默发送给另一家服务。

## 15. 分阶段落地

### 建议模块边界

Zotigo daemon 仓库：

```text
internal/zotigod/
  agent_catalog.go          # public DTO、availability 和 settings validation
  runtime_registry.go       # 按 AgentKind 解析 RuntimeAdapter
internal/runtime/
  runtime.go                # daemon-side RuntimeAdapter 和 launch spec
  native.go                 # 包装现有 native worker，不重写 agent loop
internal/codexhost/
  manager.go                # PATH discovery、process、UDS、prepare、usage cache
internal/codexbridge/
  client.go                 # WebSocket-over-UDS JSON-RPC client
  adapter.go                # RuntimeAdapter 和 capability probe
  session.go                # worker-side thread/turn/approval mapping and reconciliation
  display.go                # Codex item -> Zotigo display item
core/session/
  manager.go                # agent、binding、settings、lineage metadata
```

Codex UDS client 复用仓库已有 `gorilla/websocket`，通过 custom `NetDial` 连接 Unix socket；不为此再引入第二个 WebSocket library。`codexhost` 不依赖 Desktop DTO；`codexbridge` 只接收已经解析好的 working directory，不直接查询或修改 Zotigo Project catalog。

Desktop 仓库只修改：

- `shared/zotigod.ts`：Agent catalog、Session agent/settings DTO；
- `electron/zotigod.ts`：新 public API client；
- preload 的窄 typed API；
- New Session picker、Session badge、usage banner 和 handoff action。

renderer 不出现 UDS path、Codex thread ID、JSON-RPC request ID 或 raw app-server payload。

### 建议 PR 切分

1. `RuntimeAdapter`、registry、fake adapter 和 native wrapper，不改变默认 Zotigo 行为；
2. Session backend binding、public DTO 和兼容读取；
3. `CodexHostManager`、UDS client、prepare/catalog，只读验证 auth/model/usage capability；
4. 接入带 Workspace `cwd` 的 thread start/resume、turn start 和文本 streaming；
5. approval、steering、interrupt、response-loss reconciliation；
6. Desktop Agent picker、Codex model/reasoning picker 和状态 UI；
7. usage limited 与运行中 model/reasoning switch；
8. handoff/lineage 单独实现，避免把跨 Session 事务混入首个 Codex happy path。

每个 PR 都能由 feature flag 隔离，并且不能顺带重构 native provider/agent loop。

### 阶段 1：Host 和 capability probe

- 实现 `CodexHostManager`、binary discovery、UDS 生命周期；
- 完成 `initialize`、`account/read`、`model/list`；
- 完成 `account/rateLimits/read` 和稀疏 usage update 合并；
- 新增 `GET /agents`；
- 验证同一个 app-server 可以承载至少两个独立 thread。

完成标准：不创建 Zotigo Session，也能准确展示 installed/authenticated/model capability；daemon 退出后不遗留可用 socket。

### 阶段 2：Codex Session 最短链路

- Session metadata 增加 agent 和 binding；
- registry 按 agent 分发到 runtime adapter；
- Codex adapter 使用 Workspace 根目录作为 `cwd` 实现 thread start/resume、turn start、agent message delta/completed；
- display log 增加 backend item identity；
- Desktop 增加 Agent 选择器；
- Desktop 同期增加 Codex model/reasoning picker；没有这两项不算首版 happy path 完成。

完成标准：在一个 Zotigo Workspace 中选择 Codex、具体 model 和 reasoning effort，发送消息后 thread 的 `cwd` 等于 Workspace 根目录并可访问 `code/`、`notes/`、`artifacts/`，thread ID 持久化并可在 daemon 重启后恢复；Codex Project 数量不变。只执行 start 而未发送消息时不产生空 Codex thread binding。

### 阶段 3：控制和恢复

- 接入 steering、interrupt、command/file permission approvals；
- app-server/worker/daemon 重启恢复；
- 历史补齐与去重；
- usage limited 状态、reset 后 refresh 和显式 retry；
- Codex model 切换；
- 完整错误码、日志和状态展示。

完成标准：审批中的 Session、生成中的 Session 和 offline Session 都有确定的恢复结果。

### 阶段 4：Handoff 和第二 runtime 验证

- 实现跨 Agent handoff 和 lineage 展示；
- 用 pi、Claude Code 或最小测试 runtime 验证 interface 边界；
- runtime 复用 registry、command/event 和 fake contract；只提取真实重复的 process/transport helper，不提前建设插件框架。

## 16. 测试和观测

最低测试范围：

- fake `RuntimeAdapter` 验证 registry 路由、Session binding、Workspace `cwd`、worker command/display、approval 和错误映射，不启动外部 binary；
- native adapter contract 确认包装前后现有 Zotigo Session 行为一致；
- macOS 上 `PATH` 缺少 `codex` 时 catalog 省略 Codex；fake/真实 `codex` 可发现时才出现；
- 版本不兼容、未登录；
- prepare 只依赖 account/model 等首版能力，不调用 `project/*`；
- 首次 `/start` 和第一条消息不创建 runtime workspace binding 或 Codex Project；
- `thread/start` 携带正确 `cwd` 且不携带 `projectId`；`thread/resume` 不调用 `thread/metadata/update`；
- E2E 前后 Codex Project 数量不变，新 thread 的 `project_id` 为空，rollout 中的 turn `cwd` 等于 Workspace 根目录，且 `code/`、`notes/`、`artifacts/` 均可见；
- 历史 runtime workspace binding 和 Codex Project 保持不变，新链路既不读取也不删除；
- UDS 路径权限、路径过长、socket 未 ready、子进程异常退出；
- 只 pre-warm 未发送消息时不持久化空 Codex binding；
- 两个 Codex Session 并发执行，不串 thread/event/approval；
- create、start、message、steer、interrupt、approval 全链路；
- worker 重启、app-server 重启、daemon 重启、Desktop 重启；
- binding 落盘、Codex item 去重、display log 补齐；
- `conversation_bound` commit 后 ack 丢失、同 ID 重放、不同 ID conflict 和 stale worker connection generation；daemon 从 Session metadata 派生 Agent，worker 未获 ack 不启动 turn；
- response 丢失后通过 `clientUserMessageId` 对账，不重复创建 turn/steer；
- 同一 app-server 内 approval request replay 复用 approval ID，app-server 重启后旧 decision 不会误投；
- 两个 app-server 共享 `CODEX_HOME` 并同时 resume/turn 同一 thread 的真实行为；方案不假设存在 `backend_in_use`，测试需检查 rollout 和恢复是否损坏；
- 历史 Session 缺少 agent 字段时仍按 Zotigo 启动；
- agent-aware daemon 创建的 Codex Session 被上一可回滚版本读取时，legacy profile sentinel 使启动 fail closed；
- Codex Session 传 profile、Zotigo Session 传 model 时返回 `400`；
- model/reasoning 选项来自 catalog，非法组合返回 `400`；运行中修改只在下一轮生效；
- usage snapshot、稀疏 update 合并、reset time 到达后的 refetch；
- hard limit 不自动重放 turn，原 Codex thread 可以在 reset 后恢复；
- Codex model 切换保留 thread，跨 Agent handoff 创建新 Session；
- handoff 创建失败不修改 source Session，且不传递 reasoning、credential 或 pending approval；
- 同一 `Idempotency-Key` 重试 handoff 只产生一个 target Session；
- remote Desktop 只能看到 zotigod DTO，无法访问 UDS 或 app-server 原始方法。

建议日志字段：

```text
session_id
agent
backend_conversation_id
codex_version
app_server_instance_id
connection_id
json_rpc_method
turn_id
backend_item_id
reconnect_attempt
```

日志不得记录 token、完整 prompt、完整 tool output 或 account email。

测试分层：

- unit：runtime registry/fake adapter、Workspace `cwd`、Session binding、JSON-RPC codec、DTO tolerant decode、event mapping、usage sparse merge、error mapping、handoff package filtering；
- integration：fake app-server 通过真实 UDS/WebSocket handshake 驱动 thread start/resume、response loss、approval replay、slow consumer 和 reconnect；
- contract：CI 使用明确记录的 Codex binary/version 和生成 schema，验证本文依赖的方法及字段；
- opt-in E2E：使用临时 Zotigo data root 和测试 Codex account，验证真实登录、Codex Project 数量不变、thread 的 `project_id` 为空、Workspace `cwd`、model list、turn、approval 和 quota display。该测试不进入默认 CI，也不复用开发者个人 session data。

真实 E2E 必须保存 `zotigod commit`、`zotigo-desktop commit`、`codex --version`、Codex source commit（可获取时）、macOS version 和验证时间。只记录账号 plan type，不记录 email 或 credential。

## 17. 发布与回滚

- 保留 daemon 内部 kill switch 用于紧急下线，但不把它或 binary path 暴露成首版用户配置；正常产品行为由 `PATH` 检测决定；
- schema 变更保持向后兼容，缺少 agent 的 Session 始终按 Zotigo 读取；
- Codex Session 写入 legacy profile sentinel，使旧 daemon 对它们 fail closed；发布前必须对“新数据 + 旧 binary”做一次真实 rollback test；
- 关闭 feature flag 后，已有 Codex Session 保留可读 display log，但不再启动 runtime，并返回明确的 `agent_disabled`；
- 回滚不能删除 Codex thread 或 binding；重新启用后仍可 resume；
- Desktop 必须容忍 daemon 没有 `GET /agents`，此时只展示 Zotigo，保证新旧版本组合可用。

Codex 源码只把 TCP `ws://IP:PORT` listener 标记为 experimental / unsupported；本方案使用的 UDS 是源码明确提供给本地 control-plane client 的 transport，虽然其 payload同样采用 WebSocket Upgrade 和 frame。首期仍标记 Experimental，因为 app-server 的本地集成契约、进程共享和跨 host thread ownership 尚未形成稳定产品承诺；Zotigo 维护 tested Codex version range：

- 未验证版本默认显示 `incompatible` 或要求用户显式开启，不根据“版本更高”推断兼容；
- 不自动升级用户 Codex binary；
- feature flag 是 kill switch，不删除 Session/binding；
- 在 OpenAI 给出稳定承诺前，Zotigo 自己承担的兼容范围只覆盖 contract/E2E 已验证版本。

跨仓上线顺序：

1. 先发布 agent-aware zotigod，内部 kill switch 关闭；
2. 发布能容忍 `/agents` 缺失且识别 agent field 的 Desktop；
3. 在受控环境开启 Codex prepare 和只读 catalog；
4. 开启 Session happy path，再逐步开启 approvals、usage 和 handoff；
5. 回滚优先关闭 feature flag；binary downgrade 只在 legacy sentinel 验证通过后执行。

## 18. 评审计划（最多 5 轮）

评审在问题收敛后提前结束，不为了凑数跑满五轮。每轮只处理新增或未关闭的问题。

| 轮次 | 重点 | 退出条件 |
|---|---|---|
| 1 | 架构边界、所有权、Desktop 是否直连 | Project/Workspace/Session owner 和 UDS owner 无歧义 |
| 2 | Codex JSON-RPC 映射、公开 API、兼容性 | 每个用户动作有稳定映射，错误不会静默吞掉 |
| 3 | 崩溃恢复、幂等、安全 | binding、item、approval 和进程生命周期有确定恢复策略 |
| 4 | 实现 diff 和测试 | 无阻塞级正确性或模块边界问题，关键测试通过 |
| 5 | E2E、发布、回滚设计 | 测试分层、feature flag、版本门禁和回滚验证步骤可执行；实机结果在实现后补证据 |

停止条件：当前轮没有阻塞问题或重要问题，上一轮问题全部关闭，验证证据满足对应退出条件。

### 第 1 轮自审记录

已确认：

- UDS 应由 zotigod 持有，Desktop 不直连；
- Zotigo Session 是外部 identity，Codex thread 是内部 binding；
- Agent 创建后不可原地切换；
- 同 Agent 内切模型保留 Session，跨 Agent 使用显式 handoff；
- usage limit 保留原 Codex binding，额度恢复后由用户显式 retry；
- 共享 app-server 加每 Session bridge worker，比把 Codex 协议塞进 renderer 或全面重写 daemon runtime 更贴合现有结构；
- 公开 API 需要 Agent catalog，而不是把 Codex 伪装成一个 Zotigo model profile。

产品决策已确认：

1. 首版只复用已有 Codex 登录，不接入 `account/login/start`；
2. Codex model/reasoning picker 与 Agent picker 同期上线，属于首版完成条件；
3. 首版只支持 macOS；
4. 不提供 binary path 配置。zotigod 仅通过自身 `PATH` 检测 `codex`，检测不到时 Desktop 不展示 Codex；内部 kill switch 只用于发布回滚；
5. `initialize.clientInfo.name` 首期使用 `zotigod`；企业登记问题留作发布合规项，不阻塞本地首版；
6. handoff 以最近用户消息为主，附少量 assistant final message、Workspace/仓库/附件/变更文件路径和测试结果；使用确定性上限，不复制完整 backend history 或目录内容。

### 第 2 轮协议与 API 评审记录

状态：通过，发现的 3 个重要问题已在本文修正。

1. 原方案使用 experimental `thread/settings/update` 持久切换 Codex model。修正为 Zotigo 持久化设置，并在稳定的 `turn/start` 中逐次传递 override。
2. 原方案允许 capability probe 随 `GET /agents` 隐式启动 app-server。修正为只读 catalog 加显式 `POST /agents/codex/prepare`，并要求并发 prepare 合并。
3. 原方案没有收窄 usage snapshot 的 auth 条件。修正为只有成功读取 ChatGPT rate limits 时才报告具体额度，其他模式统一为 `unknown`。

本轮核对通过的方法：`initialize`、`thread/start`、`thread/resume`、`turn/start`、`turn/steer`、`turn/interrupt`、三类 approval request/response、`model/list`、`account/read`、`account/rateLimits/read` 和 `account/rateLimits/updated`。

### 第 3 轮恢复、幂等与安全评审记录

状态：通过，发现的 5 个重要问题已形成约束。

1. `clientUserMessageId` 只能支持 response-loss 对账，不能作为幂等承诺；所有 mutation 在重发前必须 resume/read 并确认未接受。
2. pending approval 可在同一 app-server process 重连后 replay；process 重启后旧 request ID 失效，不能重投旧 decision。
3. 原评审曾假设共享 `CODEX_HOME` 时 app-server 会报告 thread ownership conflict；增量源码核对确认当前没有跨进程 lease。现方案改为明确不支持跨 host 同时执行，并要求双 app-server E2E，不再映射虚构的 `backend_in_use`。
4. 当前 FileStore 无法原子创建跨 Session handoff；实现前必须选择 operation journal 或 SQLite transaction，API 使用 `Idempotency-Key`。
5. daemon crash 后不能按 PID 盲目清理 app-server；优先验证并接管健康旧 host，否则隔离不明进程。

本轮没有发现需要放弃 UDS 或修改 source-of-truth 结论的问题。

### 第 4 轮实现边界评审记录

状态：通过；这是当时的历史结论。2026-08-22 产品决定要求 runtime 接入显式封装成 interface，下面第 1、2 项已由本文第 5 节的增量设计替代。

1. 不新增 daemon 持有的通用 `RuntimeSession`，也不重写 native agent loop；继续复用现有 worker command/display protocol。
2. daemon 在真实的 worker launch seam 增加 `RuntimeAdapter` 和 registry；Codex JSON-RPC 仍收敛在 `internal/codexbridge`，没有形成第二套 Session 执行通道。
3. `CodexHostManager` 独立负责 process/UDS/account cache，不感知 Desktop UI 或 Project catalog 细节。
4. UDS client 复用已有 `gorilla/websocket` custom dialer，不增加重复依赖。
5. handoff 因涉及跨 Session 一致性，独立到后续 PR，不阻塞 Codex happy path。

本轮按“每个 diff 可独立验证和回滚”拆为 7 个建议 PR；实现阶段可合并相邻的小 PR，但不得把 native agent 重构混入。

### 第 5 轮 E2E、版本兼容与发布评审记录

状态：方案设计评审收敛。发现 4 个重要问题，均已形成发布约束；尚未执行实现后的实机 E2E。

1. 旧 daemon 会忽略 `agent` 字段，存在把 Codex Session 当 native Session 启动的风险；增加 reserved legacy profile sentinel，并要求真实 rollback test。
2. 原记录对 transport 的表述过宽；当前结论是 TCP `ws://` listener unsupported，UDS 是本地 control-plane transport。首期只支持 contract/E2E 验证过的 Codex version range。
3. account updates 是 process-global 信息；只由 CodexHostManager control connection 消费，Session bridge opt out，避免多 owner。
4. 实机订阅验证不能进入默认 CI或复用个人数据；增加 fake-UDS integration、pinned contract test 和 opt-in E2E 三层证据。

### 2026-08-22 Project 边界调整记录

此前关于 `RuntimeWorkspaceAdapter`、Codex Project create/reuse、Project revision fencing 和 thread `projectId` reconciliation 的评审结论已被本次产品决策取代，不再作为实现要求。

当前结论：runtime interface 只覆盖 probe 与 worker launch；Zotigo Workspace 根目录是 Codex 的 cwd，`code/`、`notes/` 和 `artifacts/` 都属于同一上下文边界；Session backend binding 只保存 Codex thread ID；新链路不读写 Codex Project。历史 Project 与 runtime workspace binding 数据保留，确保调整不做破坏性迁移。

## 19. 参考代码

- 官方 OpenAI documentation：<https://learn.chatgpt.com/docs/app-server>
- Codex transport 和 lifecycle：`codex/codex-rs/app-server/README.md`
- Codex UDS / WebSocket acceptor：`codex/codex-rs/app-server/src/lib.rs`
- Codex CLI remote transport：`codex/codex-rs/cli/src/main.rs`
- Codex Project experimental protocol（核对 commit `daa48072f4`）：`codex/codex-rs/app-server-protocol/src/protocol/v2/project.rs`
- Codex thread `projectId` fields（核对 commit `daa48072f4`）：`codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs`
- Codex Project state schema（核对 commit `daa48072f4`）：`codex/codex-rs/state/migrations/0049_projects.sql`
- Zotigo daemon public API：`zotigo/docs/zotigod-api.md`
- Zotigo worker process：`zotigo/internal/zotigod/worker_process.go`
- Zotigo Session metadata：`zotigo/core/session/manager.go`
- Zotigo Project / Workspace / Session design：`docs/project-workspace-session-design.md`
