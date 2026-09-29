# 胡筱悦的个人主页

一个四屏个人网站：个人介绍、学习记录、基于 Replicate `lucataco/remove-bg` 的图片背景移除工具，以及基于 OpenRouter `openai/gpt-5.4-image-2` 的文字生成图像工具。页面同时展示北京实时天气。

视觉采用黑白灰手稿工作室风格：不规则线框、错位硬阴影、铅笔式注释和高对比黑白头像，桌面端与手机端均可使用。

## 功能

- 响应式个人介绍与学习时间线
- Open-Meteo 北京实时天气
- 拖拽或选择 JPG、PNG、WebP 图片（最大 10 MB）
- 原图与透明背景结果并排对比
- 处理中、失败提示与 PNG 下载
- Replicate 令牌只在服务端环境变量中读取，不会发送到浏览器
- 输入文字描述生成图片，可选择比例和画质并下载结果
- OpenRouter 密钥只在服务端环境变量中读取，不会发送到浏览器

## 项目结构

- `index.html`：完整前端页面和浏览器交互
- `worker/handler.js`：服务端 API 路由与 Replicate 调用
- `scripts/build-worker.mjs`：把页面和头像嵌入可发布的 Worker
- `.openai/hosting.json`：Sites 项目配置，不保存密钥

## 环境变量

服务端需要：

```text
REPLICATE_API_TOKEN=你的 Replicate API Token
OPENROUTER_API_KEY=你的 OpenRouter API Key
```

不要把真实令牌写入 `index.html`、JavaScript 源码、README、Git 提交或截图。线上令牌应通过托管平台的 Secret / Environment Variables 功能配置。

## 构建与检查

```bash
npm run build
npm run validate
```

构建产物位于 `dist/server/index.js`。它导出 Cloudflare Worker 兼容的 `fetch(request, env, ctx)`，并提供：

- `GET /`：网页
- `POST /api/remove-bg`：接收 `multipart/form-data` 的 `image` 文件并返回透明 PNG
- `POST /api/generate-image`：接收提示词、比例和画质并返回生成图片
- `GET /api/health`：不泄露密钥的状态检查

## 数据与费用说明

上传图片会发送到 Replicate 完成背景移除；图像提示词会发送到 OpenRouter 完成生成。每次点击处理或生成都会触发一次模型调用，并可能产生对应平台费用。服务端在背景移除请求结束后安排删除临时上传文件；浏览器端不会持久保存原图或生成结果，刷新页面后本地预览会消失。
