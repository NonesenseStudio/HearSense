# 听义 HearSense

HearSense 是一个以“听到声音后理解核心含义”为目标的英语词汇学习 Web App。它使用 Nuxt 4、Vue 3、TypeScript、Cloudflare Workers 和 D1，并严格以仓库中的 `vocabulary-skills` 契约、状态机和编排规则作为唯一业务规则来源。

## 已实现范围

- 真实语境单词录入、L0–L4 保守判定、候选箱与主动池限制
- 一个语义一张卡；优先真实上下文，词典缺字段时不伪造 IPA
- 20/15/10/5 分钟计划与动态新词上限，不生成补偿任务
- 音频、文字、上下文、主动产出四类检索；先回答后揭示；污染事件不参与毕业
- 不可变复习事件、自然重遇、状态变更、毕业与重新进入主动池
- 可追溯学习分析、样本数、置信度、空分母返回 `null`
- 响应式 Material 风格 UI、键盘操作和 loading/empty/error/offline/success 状态
- PWA manifest、安装提示、Service Worker 页面/API 缓存、IndexedDB 离线事件队列

## 环境要求

- Node.js 20+
- pnpm 10+
- Cloudflare 账号（仅远程 D1 和部署需要）

安装依赖：

```bash
pnpm install
```

复制 `.env.example` 为 `.env` 可覆盖本地词典设置：

```dotenv
NUXT_DICTIONARY_BASE_URL=https://dict.hearsense.top
NUXT_DICTIONARY_TIMEOUT_MS=6000
```

这些值只在服务端使用。前端通过 `/api/dictionary/*` 访问统一服务层，不直接拼接外部 URL。敏感信息请使用 Cloudflare bindings 或 `wrangler secret put`，不要放入 `NUXT_PUBLIC_*`。

## 本地开发

普通界面开发可以运行：

```bash
pnpm dev
```

涉及 D1 的完整流程先迁移本地数据库，再使用 Workers 预览：

```bash
pnpm db:migrate:local
pnpm dev:worker
```

`pnpm dev:worker` 会先生成 Cloudflare Worker 构建，再由 Wrangler 在本地提供 D1 binding。Wrangler v3+ 默认把本地 D1 持久化在 `.wrangler/state`。

## D1 配置与迁移

1. 创建生产数据库：`pnpm wrangler d1 create hearsense`。
2. 将命令输出的 `database_id` 写入 `wrangler.jsonc` 的 `env.production.d1_databases`，替换占位 UUID `00000000-0000-0000-0000-000000000002`。
3. 本地应用迁移：`pnpm db:migrate:local`。
4. 生产应用迁移：`pnpm db:migrate:remote`。

迁移位于 `migrations/`。`review_events`、`intake_events` 和 `state_transitions` 使用触发器禁止更新/删除；业务状态变更集中在服务端 repository 与共享状态机，页面不直接访问 D1。

## Cloudflare Workers 部署

项目使用 Nitro `cloudflare_module` 预设，产物入口为 `.output/server/index.mjs`，静态资源为 `.output/public`。D1 binding 名必须保持为 `DB`。

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate:remote
pnpm deploy
```

生产与开发配置分别位于 `wrangler.jsonc` 默认段和 `env.production`。部署前必须替换生产 D1 ID；仓库不会包含 Cloudflare token 或其他密钥。

## PWA 与离线策略

- 安装时预缓存应用静态资源；已访问页面以及成功读取的 `/api/cards`、`/api/reviews/recent`、`/api/analytics` 等 GET 响应采用 NetworkFirst，并保留七天。
- 离线录入和复习事件写入浏览器 IndexedDB，界面明确显示“尚未写入 D1”，不会提前变更状态或声称同步成功。
- 应用保持打开时，`online` 事件会按创建顺序重放；也可在设置页手动同步。稳定 `clientEventId` 和数据库唯一约束保证幂等，离线重放另写入 `synced_offline_events` 供审计。
- 同步失败的事件继续保留在本机并展示待处理数量。

## 词典服务

默认地址为 `https://dict.hearsense.top`。`server/services/dictionary.ts` 统一处理超时、HTTP 错误、空结果与外部响应校验。词典数据只用于生成可编辑的语义卡草稿，不参与状态判断，也不会把全部义项直接放入首屏。

## 验证命令

```bash
pnpm typecheck          # Nuxt/Vue/服务端 TypeScript
pnpm test               # 共享 schema、录入、卡片、计划、复习、分析、词典测试
pnpm build              # Cloudflare Workers 生产构建及 PWA 生成
pnpm db:migrate:local   # 本地 D1 migration
pnpm preview            # Wrangler 预览现有构建
```

## 已知限制

- 当前是单用户原型，没有身份认证或跨账号数据隔离；正式公开部署前必须增加认证与用户维度。
- IndexedDB 队列只存在当前浏览器；关闭应用后不会依赖浏览器 Background Sync 静默提交，需再次打开应用并联网。
- 离线支持录入与复习事件；新建/编辑语义卡和创建学习会话仍要求在线。
- 只有曾在线打开并缓存过的词卡、近期记录和分析范围可离线查看；缓存不是 D1 的完整备份。
- 系统语音是缺少词典音频时的明确降级能力，不等同于词典真人发音。当前部署的词典健康端点若不可用，设置页会如实显示错误，用户需自行补全可靠词卡字段。
- `wrangler.jsonc` 中生产 D1 ID 是占位符，替换前不能执行远程 migration 或正式部署。

## 参考

- [Cloudflare：Nuxt on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/nuxt/)
- [Cloudflare：D1 migration commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [Vite PWA：Nuxt integration](https://vite-pwa-org.netlify.app/frameworks/nuxt.html)
- [isdict-api](https://github.com/simp-lee/isdict-api)
