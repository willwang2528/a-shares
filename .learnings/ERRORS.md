# Errors

## [ERR-20260718-001] sites-initializer

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary

站点初始化器拒绝在包含同步参考资料的项目根目录运行。

### Error

`Target is not empty`

### Context

项目根目录有只读 `sources/` 和 `AGENTS.md`，不应覆盖。

### Suggested Fix

在项目内的独立 `app/` 子目录初始化站点。

### Metadata

- Reproducible: yes
- Related Files: app/

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 应用已在独立子目录创建。

---

## [ERR-20260718-002] npm-install

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary

依赖安装因沙箱无法写入用户级 npm 日志目录而失败。

### Error

`npm error Exit handler never called`

### Context

初始化脚本中的 npm 进程尝试写入用户目录。

### Suggested Fix

在用户批准的安装权限下，于应用目录重跑依赖安装。

### Metadata

- Reproducible: yes
- Related Files: app/package.json

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 已成功安装依赖。

---

## [ERR-20260718-003] localhost-browser-policy

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary

企业网络策略禁止自动化浏览器访问 localhost。

### Error

`Browser use cannot access http://localhost:3000 because enterprise network policy blocks it.`

### Context

本地预览服务健康，但浏览器策略拒绝本地地址。

### Suggested Fix

先完成构建与部署，再使用生产 HTTPS 地址执行同一套响应式和交互检查；不绕过浏览器安全策略。

### Metadata

- Reproducible: yes
- Related Files: docs/LOOP_STATE.md

---

## [ERR-20260718-004] react-hooks-lint

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: frontend

### Summary

首轮代码检查发现挂载 effect 中同步设置 URL 对应页面，可能触发级联渲染。

### Error

`react-hooks/set-state-in-effect`

### Context

页面需要在客户端读取查询参数，同时避免服务端与客户端首屏不一致。

### Suggested Fix

把查询参数对应的状态更新放入微任务，保留服务端稳定首屏。

### Metadata

- Reproducible: yes
- Related Files: app/AStockApp.tsx

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 已使用微任务延后客户端页面状态同步，没有关闭规则。

---

## [ERR-20260718-005] node-worker-integration-test

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary

生产 Worker 包含 Cloudflare 运行时导入，不能直接由普通 Node ESM 加载。

### Error

`ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'cloudflare:'`

### Context

构建已通过，失败只发生在用 Node 直接导入 Cloudflare Worker 的测试方式。

### Suggested Fix

测试已生成的客户端产品包、PWA 资源和迁移包；生产 HTTP 交互改在真实部署环境验证。

### Metadata

- Reproducible: yes
- Related Files: tests/rendered-html.test.mjs

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 已改为验证部署产物，不跳过生产构建；部署后继续做真实浏览器测试。

---

## [ERR-20260718-006] secret-scan-shell-quoting

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary

首个密钥扫描命令包含不安全的混合引号，shell 在执行前拒绝解析。

### Error

`zsh: parse error near ')'`

### Context

只影响检查命令，没有读取或输出任何密钥。

### Suggested Fix

把敏感模式拆成多个单引号正则参数，避免嵌套引号。

### Metadata

- Reproducible: yes
- Related Files: .env.example

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 新扫描命令成功执行且无命中。

---

## [ERR-20260718-007] production-dependency-audit

**Logged**: 2026-07-18T00:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: config

### Summary

生产依赖审计发现 Next 内置 PostCSS 版本存在中危 CSS 输出转义公告。

### Error

`postcss <8.5.10: GHSA-qx2v-qp2m-jg93`

### Context

自动强制修复会错误地把 Next 降级到 9.3.3，属于破坏性变更，不能采用。

### Suggested Fix

只覆盖 Next 的 PostCSS 子依赖到兼容的 8.5.14，再重跑构建、测试与审计。

### Metadata

- Reproducible: yes
- Related Files: package.json, package-lock.json

### Resolution

- **Resolved**: 2026-07-18T00:00:00+08:00
- **Notes**: 将 Next 的 PostCSS 子依赖限定为 8.5.14，干净安装后 `npm audit --omit=dev` 返回 0 个漏洞，未采用破坏性的框架降级。

---
