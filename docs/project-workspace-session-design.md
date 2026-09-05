# Zotigo Project / Workspace / Session 设计

> 状态：v1 决策稿  
> 更新时间：2026-08-15  
> 目标：定义 Project、Repository、Workspace、Session 的职责、目录布局、创建交互、Git 安全边界与首版实施范围。

## 1. 结论先行

Zotigo 采用以下层级：

```text
Project
├── Shared Knowledge
├── Repository Source: zotigo
├── Repository Source: zotigo-desktop
└── Workspaces
    ├── 修复 SSE
    │   ├── Checkout: zotigo
    │   ├── Checkout: zotigo-desktop
    │   └── Sessions
    │       ├── 实现
    │       ├── 排查
    │       └── Review
    └── 审批模式接入
```

一句话定义：

- **Project** 登记长期共享的知识、代码源和默认策略。
- **Repository Source** 指向用户已有的本地 Git clone，是创建 worktree 的锚点，不是 Agent 的工作目录。
- **Workspace** 表示一个可以独立交付的事项或代码变化流；它拥有所需仓库的 checkout、branch、base commit 和运行环境。
- **Session** 表示一次可恢复或可 fork 的 Agent 对话；多个 Session 可以共享一个 Workspace。

最重要的交互规则：

- **Fork Session**：分叉思路，但继续共享同一个 Workspace 和实时文件状态。
- **Fork Workspace**：分叉代码，为每个仓库创建新的 worktree/branch，适合并行实现、方案实验或会产生冲突的修改。

这解决了“一件事需要多个实现、排查、Review Session”以及“同一个长期项目同时推进很多事项”的问题，又不会让每个 Session 都复制一套 worktree。

### 1.1 Workspace 与 WorkItem 是否要拆成两层

v1 不再额外增加用户可见的 WorkItem 层。对当前本地开发场景，WorkItem 的目标、状态、branch、checkout、Session 和交付结果总是一起变化；再套一层会让创建与导航变成 `Project → WorkItem → Workspace → Session`，收益不足以抵消理解成本。

因此首版把 **Workspace 作为 WorkItem 的可执行形态**：标题就是事项名称，后续可直接增加 brief、acceptance criteria、status 和 artifacts。如果未来出现“一个业务事项必须包含多个可独立交付、各有 branch/PR 的 Workspace”，再引入上层 WorkItem，并让现有 Workspace 平滑归属它，而不是现在预付复杂度。

## 2. 为什么不让 Session 自己拥有工作目录

Session 确实需要明确的 `cwd`，但 `cwd` 不等于 Session 必须拥有目录。

如果每个 Session 都创建 worktree：

- 同一事项下的实现、排查和 Review 会复制依赖和构建缓存；
- Session fork 无法自然看到父 Session 的最新文件状态；
- 用户难以判断哪个 worktree 才代表这件事的最终代码；
- branch、PR、运行进程和清理生命周期会错误地绑定到聊天生命周期。

因此目录归 Workspace 所有，Session 只保存 `workspace_id`。默认 `cwd` 是 Workspace 的 `code/` 根目录；同时保存 primary repository，供 Git 状态、默认命令和“打开仓库”使用。这样一个 Session 可以读取或修改 Workspace 下的多个仓库，而不会假装多仓库根目录本身是 Git repository。

Agent adapter 在启动时应得到：

```text
workspace cwd: ~/.zotigo/projects/<project-id>/workspaces/<workspace-id>/code
primary repo:  ~/.zotigo/projects/<project-id>/workspaces/<workspace-id>/code/zotigo-desktop
repositories:
  - zotigo
  - zotigo-desktop
```

需要 Git 命令时使用具体仓库目录，或显式执行 `git -C <repo-path> ...`。

## 3. 参考产品与可借鉴实践

### 3.1 Codex

[Codex worktree 文档](https://developers.openai.com/codex/app/worktrees)把本地 checkout 作为 Project，允许聊天在 Local 或独立 Worktree 中运行，并选择 starting branch。临时 worktree 可以一 chat 一份；permanent worktree 则可以成为长期 Project 并承载多个 chat。

可借鉴：

- 代码隔离与对话隔离是两个维度；长期工作目录可以承载多个对话。
- 创建时明确 base，保留时再建立或确认 branch。
- ignored 文件、依赖安装与 setup script 需要单独处理，不能假设 worktree 完整复制运行环境。

Zotigo 的差异是 Project 允许多个 Repository Source，因此把 worktree 提升为 Workspace 下的 `1:N checkout`，而不是假设 Project 永远等于单仓库。

### 3.2 Claude Code / Desktop

[Claude worktree 文档](https://code.claude.com/docs/en/worktrees)、[Desktop 文档](https://code.claude.com/docs/en/desktop)和 [Session 文档](https://code.claude.com/docs/en/sessions)区分了可恢复/可 fork 的对话与独立 worktree。其 base 策略还区分 `fresh`（远端默认分支）和 `head`（当前本地状态）。

可借鉴：

- 默认从 `origin/<default-branch>` 创建干净 Workspace；高级选项才从当前 HEAD 或指定 ref 开始。
- 同一事项的后续对话可以 resume/fork；真正并行写代码才新建 worktree。
- worktree 只做文件隔离，不是安全 sandbox；Git common dir、配置和部分权限仍共享。

### 3.3 Conductor

[Conductor 的 Workspace 与 branch 模型](https://www.conductor.build/docs/concepts/workspaces-and-branches)和 [Git worktree 说明](https://www.conductor.build/docs/concepts/git-worktrees)最接近 Zotigo：Workspace 同时承载 branch、files、commands、chats、diff 和 PR；多个 Agent 在同一 Workspace 时共享代码状态。

可借鉴：Workspace 应是 task/issue/experiment/PR 的隔离容器，Session 只是其中一种活动。其默认从 Project 已登记的本地仓库创建 linked worktree，也支持 [`.worktreeinclude`](https://www.conductor.build/docs/reference/worktreeinclude) 处理必要的 ignored 文件。

### 3.4 Cursor

[Cursor Background Agents](https://docs.cursor.com/background-agent)选择远程 VM、GitHub clone 和独立 branch，repo/base branch 是任务输入。它适合远程异步执行，但带来 credential、网络和机器生命周期成本。

可借鉴的是“Workspace 必须显式知道 repo 和 base branch”；本地 v1 不需要因此引入远程 clone 或托管 bare mirror。

### 3.5 GitButler 与 Graphite

[GitButler 的 virtual branches](https://blog.gitbutler.com/virtual-branches-alpha)证明单工作目录多变化流可以降低依赖重复，但它依赖自有 shadow-index/virtual-branch 状态机，不适合作为首版底座。

[Graphite 的 multiple worktrees 指南](https://graphite.com/docs/multiple-worktrees)尊重“一条 branch 同时只能被一个 worktree checkout”的限制，并避免跨 worktree 修改被占用的 branch。Zotigo 应采用这个保守模型，不用 `--force` 绕过 Git 的保护。

### 3.6 Git 与成熟 worktree 工具

[Git worktree 官方文档](https://git-scm.com/docs/git-worktree)提供 `add/list/move/remove/repair/lock`，并明确 porcelain 格式是脚本稳定接口。[Git clone 文档](https://git-scm.com/docs/git-clone)说明 bare/mirror/shared clone 有不同 ref 与对象所有权语义。

[Worktrunk](https://worktrunk.dev/switch/)支持多种路径策略，并在[删除流程](https://worktrunk.dev/remove/)中把“删除 dirty worktree”和“删除未合并 branch”视为两个独立风险。这种风险拆分值得照搬。

[GitHub Copilot 的 agent workspace](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app)还区分了有 branch/worktree 的并行 Workspace 与不创建专属 Workspace 的 Quick chat；[Factory Droid](https://docs.factory.ai/droid-cli/cli-reference)同样把 worktree 作为显式模式，并在 branch 已被另一个 worktree 使用时失败。它们共同说明：纯讨论不必承担 worktree 成本，而代码变化流必须有清楚的 branch owner。

## 4. 最终领域模型

### 4.1 Project

Project 是长期容器，可以对应一个产品、系统或持续领域，而不强制等于单仓库。

保存：

- 名称、说明与 Shared Knowledge 引用；
- 一个或多个 Repository Source；
- primary repository；
- 默认 base branch、setup/run 命令等策略；
- Workspaces。

Project 不拥有具体 branch，也不作为 Agent 默认写入位置。

### 4.2 Repository Source

Repository Source v1 登记用户已有本地 clone：

- `canonical_path`
- `git_common_dir`
- `remote_url`（可以为空）
- `default_branch`（例如 `main`）
- `is_primary`
- `last_probed_at` 和 `availability`（`available` / `unavailable`）

首版不复制为 managed bare repository，原因是：

1. 用户已有 clone 已经提供 objects、refs、credentials 和 Git 配置；
2. linked worktree 不会修改 source checkout 的工作区文件；
3. bare clone 的 remote-tracking ref、fetch、认证和同步语义需要 Zotigo 重新定义；
4. `clone --shared` 还会带来源仓库 GC 导致对象丢失的风险。

以后如需 remote-only onboarding，可增加显式的 `source_kind = managed`，但不能悄悄迁移用户 source。linked worktree 依赖登记 clone 的 Git common dir：source 移动后可以通过原 common-dir identity 做 repair；source 被删除后不能把任意新 clone 当作等价 Relink。仍有 Workspace checkout 时禁止移除 Repository Source，并在 UI 明确显示 unavailable。

### 4.3 Workspace

Workspace 是一个有意义的事项和代码变化流：

- 标题、目标、状态；
- `project_id`；
- 不可变 ID；
- `code_path`；
- 选中的 repositories；
- 每个 repository 的 base ref、base commit、branch、worktree path；
- 将来的 setup/run 状态、PR 和 artifacts。

v1 状态：

- `provisioning`：记录已建立，正在创建 checkout；
- `ready`：所有 checkout 创建完成；
- `error`：部分创建或持久化失败，需要重试/人工处理；

### 4.4 Session

Session 保存：

- `workspace_id`（可以为空，兼容 No project / 历史会话）；
- backend 与 native session ID；
- transcript、runtime 和 approval 的后端引用；
- title、pin 和最近打开时间。

Session 不拥有 branch/worktree，也不复制其他 Session 的完整 transcript。

## 5. 物理目录

```text
~/.zotigo/
├── config.yaml
└── projects/
    └── <project-id>/
        └── workspaces/
            └── <workspace-id>/
                └── code/
                    ├── zotigo/
                    └── zotigo-desktop/
```

路径使用不可变 ID，不使用可变标题或 branch 名；UI 只展示有意义的标题。仓库子目录使用持久化的、冲突安全的 `repo_key`。

`code/` 作为 Session cwd 的优点：

- 一个 Session 可以同时改多个仓库；
- Workspace 未来可在同级增加 `artifacts/`、`logs/` 或运行配置，而不会混入源码；
- 删除或归档的安全边界清楚。

缺点是 `code/` 本身不是 Git repository。UI 和 Agent 上下文必须明确 primary repo；不能依赖在根目录裸跑 `git status`。

## 6. Workspace 创建交互

首版不必调用模型，也要做到“有含义、可确认”：

1. 用户在 Project 下点击 **New workspace**。
2. 输入目标/名称，例如“修复 SSE 工具结果延迟”。
3. UI 生成可编辑建议：
   - Workspace title：原输入；
   - Branch：`zotigo/<slug>-<short-id>`；slug 只保留输入中合法的 ASCII 字母、数字和连字符，无法得到 slug 时使用 `workspace-<short-id>`；
   - Repositories：默认 primary；
   - Base：默认 `origin/<default-branch>`，若不存在则当前 HEAD；
   - Working mode：Worktree。
4. 用户确认后创建。
5. 创建完成后打开 Workspace 的 New Session 页面；之后可在同一 Workspace 新建/恢复/fork 多个 Session。

未来模型只参与生成 title、branch slug、推荐 repositories 和 acceptance criteria。Git refs 和最终选择必须由确定性校验确认，不能让模型直接执行 Git。v1 的 slug 规则是确定性的，不会声称理解或翻译中文语义。

**Quick Session** 继续保留：用户从全局 New Session 创建、不选择 Project 时，`project_id` 和 `workspace_id` 都为空，不创建 worktree。它适合纯讨论；一旦需要项目文件上下文，用户应选择已有 Workspace 或创建 Workspace。v1 不把所谓 read-only/local mode 当作隔离或权限边界。

### 6.1 为什么 v1 立即建 branch

Codex 的 disposable chat 可以先 detached HEAD，但 Zotigo Workspace 被定义为一个长期事项，可能承载多个 Session、提交和 PR。v1 因而直接创建语义 branch，减少“何时 materialize branch”的第二套状态机。临时纯调查场景未来可增加 detached/read-only mode。

## 7. Git 创建与安全规则

### 7.1 创建

每个 repository checkout 使用确定性参数：

```text
git -C <source-path> worktree add --lock --reason "managed by Zotigo workspace <id>" -b <branch> <target-path> <base-ref>
```

要求：

- 创建前用 `git check-ref-format --branch` 校验 branch；
- 保存用户选择的 `base_ref` 和创建时解析出的 `base_commit`；
- 不省略 base ref，不依赖 source 当前 checkout 的隐式 HEAD；
- 不使用 shell 拼接命令；Electron main 用参数数组启动 Git；
- 不使用 `--force` 绕过 branch/worktree 占用；
- 持久 app-owned checkout 创建时加 lock，避免外部 prune 清掉仍被 Zotigo 管理的 worktree；
- 同一 Git common dir 的 topology 操作串行执行；普通文件编辑不需要全局锁。

### 7.2 部分失败

多仓库创建不是数据库和文件系统的原子事务。正确流程：

1. 先插入 `provisioning` Workspace 与 checkout 计划；
2. 逐个创建 worktree，成功一个就记录一个；
3. 全部完成后变为 `ready`；
4. 失败时只尝试移除本次新建且确认 clean 的 worktree；
5. branch 默认保留；任何无法安全回滚的情况进入 `error`，展示具体路径和恢复动作。

v1 只创建 primary repository，一个数据库事务加一个 Git 操作即可覆盖主要路径；schema 仍保留 `1:N`，避免把“Project=单仓库”写死。

#### 崩溃恢复与幂等重试

`provisioning` 是可恢复状态，不是等待人工猜测的中间值。应用启动或用户重试时，Electron main 读取 checkout 计划，并用 `git worktree list --porcelain -z` 按 source common dir 对账：

- **完全匹配**：exact path 已登记为 worktree，checkout 的 branch 与计划 branch 一致，HEAD 等于计划的 `base_commit`（尚无用户提交时）或仍属于该 branch；补记 checkout/Workspace 为 `ready`。
- **完全不存在**：path 不存在、branch 不存在、worktree topology 中也无记录；安全地重放创建命令。
- **部分存在或不匹配**：path、branch、common-dir 或 HEAD 身份冲突；标记 `error`，不自动删除、不覆盖、不使用 `--force`。

同步异常时的补偿仍只处理本次进程确认新建、exact path 且 clean 的 checkout；进程崩溃后的恢复不通过“先删再建”解决。这样 `git worktree add` 成功但 SQLite 最终状态未写入的窗口也是幂等的。

### 7.3 对账与移动

- 使用 `git worktree list --porcelain -z`，不读取 `.git/worktrees` 内部实现目录；
- source 被移动后让用户 Relink，并用 `git worktree repair` 修复引用；
- worktree 移动必须用 `git worktree move`，不能直接 rename 文件夹；
- submodule 的多 worktree 支持有限，v1 检测 `.gitmodules` 后给出限制提示，不自动改 submodule 配置。

### 7.4 归档与删除

v1 不实现 Archive 或 Delete；用户可以保留 Workspace。后续 Archive 只改变产品状态，不删除文件或 branch。

未来 Delete 必须拆分：

1. Remove checkout：停止 Workspace 进程，确认路径仍在 app-owned root，并要求 staged/unstaged/untracked 全部为空，然后 `git worktree remove <exact-path>`；
2. Delete branch：单独二次确认，默认保留；不能把“worktree clean”等同于“branch 已合并”。

禁止默认 `rm -rf`、`git worktree remove --force` 或后台无范围 `git worktree prune`。

## 8. 并发与共享边界

同一 Workspace 下多个 Session：

- 读取同一份实时文件；
- Git branch、index 和工作区一致；
- 实现与 Review 能自然接力；
- 两个写 Session 同时运行可能互相覆盖，UI 应提醒“共享代码环境”。

不同 Workspace：

- 文件和 index 隔离；
- 仍共享 Git objects、refs、config、hooks 和 stash；
- fetch/rebase/branch delete/worktree topology 需要在 Electron main 中按 common dir 串行；
- 端口、数据库、缓存和外部服务不因 worktree 自动隔离。

因此 worktree 是开发隔离，不是安全隔离或完整 runtime sandbox。

## 9. v1 数据迁移

在现有 SQLite 上做 additive migration：

```text
project_repositories
  id, project_id, repo_key, name, source_path, git_common_dir,
  remote_url, default_branch, is_primary, availability, last_probed_at,
  created_at, updated_at

workspaces
  id, project_id, title, code_path, status,
  created_at, updated_at, last_opened_at

workspace_checkouts
  id, workspace_id, repository_id, worktree_path,
  base_ref, base_commit, branch_name, status, error,
  created_at, updated_at

conversations
  + workspace_id nullable
```

数据库约束：

- `UNIQUE(project_id, repo_key)`；
- `UNIQUE(workspace_id, repository_id)`；
- partial unique index 保证每个 Project 最多一个 primary Repository Source；
- 创建 Conversation 时在同一事务中验证 `workspace.project_id = conversation.project_id`。

兼容策略：

- SQL migration 只建新表和 nullable column，不访问文件系统或运行 Git，因此数据库打开不会被外部路径阻塞；
- 现有 `projects.path` 暂时保留；启动后的 best-effort backfill 只为验证为 Git repository 的 path 补 primary Repository Source；
- path 丢失、非 Git 或无权限的旧 Project 保持 legacy 可见，标记为“需要重新关联”，不能阻止应用启动；
- 现有 Conversation 的 `workspace_id` 保持空，继续直接显示在 Project 下；
- 新 Conversation 在 Workspace 中创建时同时保存 `project_id` 与 `workspace_id`，便于旧查询和降级兼容；
- 后续确认稳定后再考虑废弃 `projects.path`，首版不做破坏性迁移。

### 9.1 升级与降级边界

schema migration 是 additive，历史 Project、Conversation、binding、pin/order 和 preferences 必须原样保留。历史 Project Conversation 可以继续读取；已有 daemon binding 也可以继续对话，但若其 runtime 需要重建，Desktop 会要求先创建 Workspace，避免重新落回 Repository Source 直接写代码。

创建过 Workspace Session 后不支持降级到不认识 `workspace_id` 的旧版 Desktop：旧版可能把 Session 当作普通 Project Session，并在重建 runtime 时使用 `projects.path`。首版发布与测试必须把“数据库可升级、产品不支持降级”作为明确边界；回滚应使用升级前的应用数据备份，而不是直接运行旧二进制。

## 10. v1 实施范围

本轮实现最小可用闭环：

1. Project folder 必须是 Git repository，创建 Project 时登记 primary Repository Source；
2. 在 Project 下创建 Workspace，用户确认 title、base ref 和 branch；
3. Electron main 安全创建 primary repository linked worktree；
4. Sidebar 展示 `Project → Workspace → Session`，历史 Session 仍直接位于 Project 下；
5. 在 Workspace 中创建的 Zotigo Session 以 Workspace `code/` 为 cwd；
6. 同一 Workspace 可以创建多个 Session；
7. 全局 Quick Session 继续可用，不创建 Project/Workspace/worktree；
8. 通过临时 Git fixture 做端到端测试，不调用模型 API。

明确不做：

- managed bare repository、remote clone 或自动 fetch；
- 多仓库 Workspace 的 UI（schema 支持，后续按需 attach）；
- 自动 setup、`.worktreeinclude`、端口分配或进程管理；
- Workspace delete、branch delete、自动 prune；
- AI 自动规划或自动生成 branch；
- Codex 全量 Session 自动导入。

## 11. 验收标准

- 创建 folder-backed Project 后能看到被登记的 primary Repository Source。
- 从显式 base ref 创建 Workspace 后，目标目录、branch 和 base commit 正确，source checkout 的 HEAD 与文件状态不变。
- 同一 Workspace 下创建两个 Session 时，两者获得相同 Workspace cwd，且不额外创建 worktree。
- 历史 Conversation 与 No project Conversation 继续可见、可打开。
- branch 名非法、已存在或被 worktree 占用时给出可理解错误，不留 `ready` 假记录。
- 模拟 `worktree add` 后、标记 ready 前崩溃并重启时，reconcile 能识别完全匹配的 checkout 并完成状态；冲突状态进入 `error` 且不覆盖文件。
- legacy Project path 无效时 migration/启动仍成功，Project 保持可见并等待重新关联。
- 应用重启后 Project、Workspace、checkout 与 Session 归属仍可恢复。
- E2E 不调用 zotigod 的模型生成接口，不消耗 API token。

## 12. 后续演进触发条件

只有出现真实需求时再增加：

- **多仓库 attach**：某 Workspace 需要同时改第二个 Repository Source；
- **Fork Workspace**：需要从当前 `base_commit` 生成另一个代码方案；
- **managed source**：用户只提供 remote URL，或 source clone 不应长期存在；
- **runtime profile**：多个 Workspace 的端口、依赖和数据库发生真实冲突；
- **AI planning**：用户希望用自然语言推荐 repositories/base/branch，并愿意确认结果；
- **安全清理**：磁盘占用成为问题后，实现 archive 检查、remove checkout 与独立 branch 删除。

这套模型不要求用户每天理解四层概念。常规 UI 只呈现“Project 下的 Workspaces，每个 Workspace 里有 Sessions”；Repository Source 和 checkout 只在创建/修复/高级设置中出现。
