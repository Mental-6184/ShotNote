# ShotNote

ShotNote 是一个面向 Windows 的截图标注工具，基于 Electron 构建。它支持全局快捷键截图、区域选取、图像批注、OCR 识别、导出 PNG，以及历史记录回看，适合日常沟通、问题反馈和文档整理场景。

## 功能特性

- 全局快捷键截图：`Ctrl + Alt + Shift + S`
- 多屏环境下按显示器分别发起截图
- 截图后直接进入编辑界面
- 支持画笔、高亮、矩形、箭头、文字、马赛克、模糊、拖拽等标注工具
- 支持撤销、重做、缩放、适应窗口
- 支持 OCR 文字识别，可选择 `中文 + 英文`、`中文`、`英文`
- 支持复制到剪贴板
- 支持导出 PNG
- 支持本地历史记录查看与重新打开
- 支持将本地图片直接拖入编辑器继续标注

## 界面说明

- 顶部工具栏：切换工具、缩放控制、撤销重做、OCR、截图、复制、导出
- 左侧边栏：颜色选择、线宽设置、OCR 语言切换、历史记录
- 中央画布：预览截图并进行批注编辑

## 快捷键

- `Ctrl + Alt + Shift + S`：新建截图
- `Ctrl + Z`：撤销
- `Ctrl + Shift + Z`：重做
- `Ctrl + Y`：重做
- `Ctrl + 0`：适应窗口
- `Ctrl + 鼠标滚轮`：缩放画布
- `Esc`：取消截图或关闭文字输入
- `Space`：临时切换为拖拽视图

## 运行环境

- Windows
- Node.js 18 及以上版本
- npm

## 安装与启动

安装依赖：

```bash
npm install
```

启动开发版：

```bash
npm start
```

如果希望双击启动，也可以使用：

```text
Start ShotNote.vbs
```

## 打包发布

生成图标资源：

```bash
npm run icons
```

生成安装包：

```bash
npm run build
```

仅生成未打包目录：

```bash
npm run pack
```

构建产物默认输出到：

```text
dist/
```

## 使用流程

1. 按下 `Ctrl + Alt + Shift + S`，或在主界面点击“新建截图”。
2. 在屏幕上拖拽选中需要截取的区域。
3. 截图会自动载入编辑器。
4. 使用画笔、文字、箭头、马赛克等工具完成标注。
5. 通过“复制”将结果放入剪贴板，或通过“导出 PNG”保存到本地历史记录目录。

## 历史记录

导出的截图会保存到 Electron 用户数据目录中的 `history` 文件夹，并同步记录索引信息。应用内左侧历史面板可直接查看并重新打开这些图片。

## 项目结构

```text
ShotNote/
├─ assets/                 图标资源
├─ dist/                   打包输出目录
├─ src/
│  ├─ index.html           界面结构
│  ├─ renderer.js          渲染进程逻辑
│  └─ styles.css           界面样式
├─ tools/
│  └─ generate-icons.ps1   图标生成脚本
├─ main.js                 Electron 主进程
├─ package.json            项目配置
└─ Start ShotNote.vbs      Windows 快捷启动脚本
```

## 技术栈

- Electron
- screenshot-desktop
- tesseract.js
- electron-builder

## 注意事项

- 当前项目主要面向 Windows 使用场景。
- OCR 首次执行时可能需要加载相关识别资源，速度会略慢。
- 历史记录图片会持续保存在本地，如需控制体积，建议定期清理。

## 许可证

当前仓库未单独附带开源许可证文件。如需公开分发，建议补充明确的许可证声明。
