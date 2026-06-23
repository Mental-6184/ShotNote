# ShotNote

ShotNote 是一款面向 Windows 的截图标注工具，支持快捷键截图、区域选取、即时批注、OCR 识别，以及导出到剪贴板或 PNG 文件。

## 主要功能

- 全局快捷键截图
- 框选屏幕区域后进入编辑
- 画笔、荧光笔、矩形、箭头、文字、马赛克、模糊、拖拽等标注工具
- 撤销、重做、缩放、适应窗口
- 一键复制到剪贴板
- 导出 PNG 图片
- 本地历史记录管理
- OCR 文字识别

## 快捷键

- `Ctrl + Alt + Shift + S`：新建截图
- `Ctrl + Z`：撤销
- `Ctrl + Y`：重做
- `Ctrl + 0`：适应窗口
- `Ctrl + 鼠标滚轮`：缩放
- `Esc`：取消截图或关闭文字输入

## 安装与运行

### 运行开发版

```bash
npm install
npm start
```

### 打包

```bash
npm run build
```

## 使用方式

1. 按下 `Ctrl + Alt + Shift + S`，或点击界面中的“新建截图”
2. 在屏幕上拖拽选择需要截取的区域
3. 进入编辑器后，使用左侧工具栏进行标注
4. 完成后可选择“复制”或“导出 PNG”

你也可以直接把图片拖入窗口进行编辑。

## OCR 识别

ShotNote 内置 OCR 入口，默认支持 `中文 + English` 识别，也可以切换为单独中文或英文模式。

## 历史记录

导出的截图会保存在 Electron 的用户数据目录下，并显示在应用内的历史记录列表中，方便再次查看或复用。

## 项目结构

```text
ShotNote
├─ main.js
├─ src
│  ├─ index.html
│  ├─ renderer.js
│  └─ styles.css
├─ package.json
└─ Start ShotNote.vbs
```

## 启动脚本

如果你不想打开终端，也可以直接双击 `Start ShotNote.vbs` 启动程序。

## 技术栈

- Electron
- screenshot-desktop
- tesseract.js

## 许可证

当前项目未单独声明许可证，如需开源发布，请先补充许可文件。
