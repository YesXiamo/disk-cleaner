# Disk Cleaner v1.0.1 发布说明

## 🚀 性能优化版本

### ⚡ 优化内容

- **磁盘扫描性能提升** - 使用 `fast-glob` 替代原生 `fs.readdir`
  - 并行处理文件 stat 操作，大幅提升扫描速度
  - 添加并发控制 (concurrency: 100)
  - 优化错误处理机制

### 📦 安装包

- **文件名**: `Disk Cleaner-1.0.1-arm64.dmg`
- **大小**: ~99MB
- **架构**: arm64 (Apple Silicon)
- **系统要求**: macOS 10.15+

---

# Disk Cleaner v1.0.0 发布说明

## 🎉 首次发布

Disk Cleaner - Mac 磁盘清理工具，带热力图可视化

## ✨ 功能特性

- 🔥 **树状图热力图** - 一眼看出磁盘占用情况
- 🖱️ **右键菜单** - 打开、Finder 中查看、删除
- 👻 **显示隐藏文件** - 以 `.` 开头的文件夹无所遁形
- 📊 **磁盘使用统计** - 实时显示容量、已用、可用空间
- 🗑️ **文件删除** - 支持删除文件和文件夹
- 🎨 **7级颜色系统** - 直观显示文件大小层级

## 📦 安装包

- **文件名**: `Disk Cleaner-1.0.0-arm64.dmg`
- **大小**: 99MB
- **架构**: arm64 (Apple Silicon)
- **系统要求**: macOS 10.15+

## 🚀 安装方法

1. 下载 `Disk Cleaner-1.0.0-arm64.dmg`
2. 双击打开 DMG 文件
3. 将 `Disk Cleaner.app` 拖到 Applications 文件夹
4. 从启动台打开应用

## ⚠️ 注意事项

- 首次打开可能需要到「系统设置 > 隐私与安全性」中允许
- 扫描系统目录可能需要管理员权限
- 删除操作不可逆，请谨慎操作

## 📜 开源协议

MIT License - 免费使用、随意修改

## 🔗 相关链接

- Git 仓库: https://code.alibaba-inc.com/dengwenwu.dww/disk-cleaner.git
- 问题反馈: 请在仓库提交 Issue

---

**Happy Cleaning! 🧹**