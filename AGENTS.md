# Disk Cleaner - 项目上下文

## 项目概述

**Disk Cleaner** 是一款基于 Electron 开发的 Mac 磁盘清理软件，具有美观的深色主题 UI 界面和实用的文件管理功能。通过树状图热力图可视化方式直观展示磁盘占用情况。

### 核心功能
- **磁盘扫描** - 递归扫描目录，分析文件大小和占用情况
- **树状图可视化** - 单一大方块布局，按文件占比显示不同大小
- **隐藏文件夹显示** - 支持显示以 `.` 开头的隐藏文件和文件夹
- **磁盘使用统计** - 实时显示磁盘总容量、已用空间和可用空间
- **文件管理** - 右键菜单支持打开、在 Finder 中打开、查看详情、删除
- **文件夹导航** - 点击进入文件夹，支持返回上级和面包屑导航

### 技术栈
- **Electron** - 跨平台桌面应用框架
- **Node.js** - 后端文件系统操作
- **HTML/CSS/JavaScript** - 前端界面
- **Flex 布局** - 树状图自适应布局

## 项目结构

```
disk-cleaner/
├── package.json          # 项目配置和依赖
├── src/
│   ├── main.js          # Electron 主进程（IPC 处理、文件扫描）
│   ├── index.html       # 主界面 HTML
│   ├── renderer.js      # 渲染进程逻辑（UI 交互、热力图渲染）
│   └── styles.css       # 样式文件（深色主题、毛玻璃效果）
├── build/               # 构建资源（图标等）
├── dist/                # 打包输出目录
├── screenshots/         # 应用截图
├── README.md            # 项目说明文档
└── RELEASE_NOTES.md     # 发布说明
```

## 构建与运行

### 开发环境要求
- Node.js
- npm
- macOS（目标平台）

### 常用命令

```bash
# 安装依赖
npm install

# 启动应用（开发模式）
npm start

# 打包 Mac 版本（生成 dmg）
npm run build

# 仅生成应用目录（不打包 dmg）
npm run build:mac:dir

# 打包输出位置
dist/mac-arm64/Disk Cleaner.app
```

## 开发约定

### 代码组织
- **主进程 (main.js)**: 负责系统级操作（文件扫描、删除、对话框、磁盘信息获取）
- **渲染进程 (renderer.js)**: 负责 UI 交互、热力图渲染、事件处理
- **样式 (styles.css)**: 使用 CSS 变量管理主题色，深色主题设计

### IPC 通信
主进程暴露以下 IPC 接口：
- `scan-directory` - 扫描指定目录
- `get-home-directory` - 获取用户主目录
- `delete-file` - 删除文件/文件夹
- `show-open-dialog` - 显示目录选择对话框
- `open-in-finder` - 在 Finder 中打开文件

### UI 设计规范
- **颜色系统**: 7级渐变色表示文件大小（紫→蓝→绿→黄→橙→红→深红）
- **主题**: 深色背景 + 毛玻璃效果 + 圆角设计
- **交互**: 平滑过渡动画、悬停效果、右键菜单

### 文件扫描逻辑
- 默认最大扫描深度：4层
- 跳过的系统目录：`node_modules`, `.Trash`, `.Spotlight-V100`, `.fseventsd`, `.DocumentRevisions-V100`
- 保留隐藏文件（以 `.` 开头）显示

## 注意事项

1. **权限问题** - 扫描系统目录可能需要管理员权限
2. **删除操作** - 删除后不会自动刷新，需手动点击刷新按钮
3. **平台限制** - 仅支持 macOS（arm64 架构）
4. **打包配置** - 应用图标需放置在 `build/icon.icns`

## 版本信息

- **当前版本**: v1.0.0
- **许可证**: MIT License
- **作者**: 基于 Electron 开发的 Mac 磁盘清理工具
