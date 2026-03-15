# OneThought

Windows 平台快速想法记录工具（Electron + React + TypeScript）。

## 功能

- 全局快捷键（默认 `Super+T`）快速唤起输入窗口
- 设置页开机自启动开关
- 主界面按天/按月分组时间线浏览
- 想法归档/激活切换
- OpenAI 兼容接口总结与思维导图生成（带离线缓存）
- JSONL 本地存储、索引文件、备份与恢复

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run dist
npm run dist:portable
```

## 测试脚本

```bash
npm run test:perf:100k
npm run test:stability:72h
npm run test:poweroff
```
