# 极简 3D 场景漫游

在浏览器中查看 3D Gaussian Splatting（三维高斯泼溅）场景，支持键鼠和手机触摸操作。你可以浏览已有场景，也可以导入自己的高斯 PLY 文件。

场景按需分块加载，支持 WebGPU 和 WebGL 2。

## 在本地运行

先安装 Git、Node.js 22.12 或更新版本，以及随 Node.js 安装的 npm。使用 nvm 的话，可按项目中的 `.nvmrc` 安装 Node.js。

在终端中执行以下命令（macOS / Linux）：

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/urlyy/asoul-concert-3d.git
cd asoul-concert-3d
npm ci
npm run dev
```

Windows PowerShell 用户先设置 `$env:GIT_LFS_SKIP_SMUDGE="1"`，再执行 `git clone https://github.com/urlyy/asoul-concert-3d.git`，其余命令相同。

打开终端显示的网址即可浏览自带场景。`GIT_LFS_SKIP_SMUDGE=1` 会跳过原始 PLY 下载，本地浏览使用已转换好的场景分块。已经下载项目的话，从 `npm ci` 开始。

要用手机浏览，请让手机和电脑连接同一局域网，运行：

```sh
npm run dev -- --host 0.0.0.0
```

在手机上打开终端显示的局域网地址，并将手机横过来。

## 怎么操作

### 桌面

点击场景后使用键盘，按住鼠标左键拖拽转头。

| 操作 | 功能 |
| --- | --- |
| W / S | 沿视线前进 / 后退 |
| A / D | 沿机身左右平移 |
| R / F | 沿机身上升 / 下降 |
| Q / E | 左 / 右侧倾 |
| Shift | 按住三倍加速 |
| Home 或「重置」 | 回到初始视角并停止移动 |

### 手机

横屏使用，左手按住左下角方向键移动，右手拖拽场景转头，两手可以同时操作。

「升 / 降」和「左倾 / 右倾」按住生效。「快速」点击开启三倍速度，再点关闭。「全屏」是否可用取决于浏览器；无法自动横屏时，请手动旋转手机。

前进跟随视线，可以翻转和倒飞；上下、左右移动也跟随机身方向。松开方向键会短暂减速。「重置」返回当前场景的起点，同时关闭快速模式，松手后可以重新操作。这里没有重力或碰撞，松手不会坠落，也可以穿过物体。

点击右上角「场景」可以切换场景。

## 加入自己的场景

### 1. 准备 PLY 文件

将 Gaussian Splatting 工具导出的 `.ply` 放到项目根目录的 `assets/` 中，例如 `assets/我的展厅.ply`。文件名会作为新场景的默认名称。

文件需要包含高斯颜色、透明度、缩放和旋转属性。普通 XYZ/RGB 点云虽然也可能使用 `.ply` 扩展名，但不能用于这个转换流程。

### 2. 转换并预览

在项目根目录执行：

```sh
npm run convert -- "assets/我的展厅.ply"
npm run dev
```

转换完成后，打开本地网页，在「场景」菜单中选择「我的展厅」。新场景会追加到目录中，已有场景仍可使用。

如果转换时无法使用 GPU，可改用 CPU，速度会慢一些：

```sh
npm run convert -- "assets/我的展厅.ply" --gpu cpu
```

### 3. 修改名称和默认场景

打开 `public/scenes.json`，找到新场景的条目：

| 字段 | 用途 |
| --- | --- |
| `scenes[].name` | 菜单中显示的名称 |
| `defaultScene` | 默认打开的场景 ID |
| `showSwitcher` | 是否显示场景菜单；`false` 为隐藏 |
| `scenes[].camera` | 该场景的初始视角和移动速度 |

要把新场景设为默认场景，将它的 `id` 复制到文件顶部的 `defaultScene`，保存后刷新网页。ID 和资源路径由转换器生成，不需要自己编写。若看不到场景菜单，将 `showSwitcher` 改为 `true`。

接着按下方教程设置起点。修改源 PLY 后需要重新转换；新内容会生成新的场景条目，也需要重新确认起点。

## 设置场景初始视角（debug）

1. 运行 `npm run dev`，在网址后加 `?debug`，例如 `http://127.0.0.1:5173/?debug`。如果网址已有 `?scene=...`，在后面加 `&debug`。
2. 选择要设置的场景，等加载完成后移动到合适位置，并调整朝向。
3. 打开浏览器开发者工具（F12 或右键「检查」），切换到 **Console / 控制台**，执行以下代码：

```js
var view = window.__viewer.snapshot();
var entrance = {
  position: view.position,
  quaternion: view.quaternion,
  fov: view.fov
};
copy(JSON.stringify(entrance, null, 2));
entrance;
```

代码一次复制三项数据：`position` 是位置，`quaternion` 是完整朝向（包括侧倾），`fov` 是视野角度。`copy()` 返回 `undefined` 是正常现象；如果浏览器不支持 `copy()`，可手动复制控制台中的 `entrance` 对象。若提示 `__viewer` 不存在，确认网址带有 `debug` 并等待场景加载完成。

4. 打开 `public/scenes.json`，按场景名称找到对应条目，将复制的三项数据合并到它的 `camera` 中，保留已有的 `moveSpeed` 等其他设置。例如：

```json
"camera": {
  "position": [12.3, 4.5, 67.8],
  "quaternion": [0, 0, 0, 1],
  "fov": 65
}
```

将示例中的数字替换为刚才导出的值，保留 `position`、`quaternion`、`fov` 三项，才能还原位置、朝向和视野。

5. 刷新页面，确认场景从新视角打开，再点击「重置」检查是否回到同一位置。

修改每个场景的 `camera.moveSpeed` 可调整基础移动速度（世界单位/秒）。其他通用设置位于 `public/viewer-config.json`。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| `npm` 命令找不到 | 安装 Node.js 后重新打开终端 |
| 手机竖屏不显示场景 | 关闭系统方向锁定，将手机横过来 |
| 手机打不开本地网页 | 确认与电脑在同一局域网，使用 `--host 0.0.0.0` 启动，并访问电脑的局域网地址 |
| 提示缺少高斯属性 | 确认输入是 Gaussian Splatting PLY，而非普通点云 |
| 场景加载失败 | 查看终端是否有错误，确认 `public/scenes.json` 和对应的 `public/scenes/` 分块完整 |
| 想重新转换仓库自带的场景 | 安装 Git LFS，执行 `git lfs install` 和 `git lfs pull --include="assets/*.ply"` 下载源文件 |

已有源文件的说明见 [assets/README.md](assets/README.md)。开发和部署说明见 [AGENTS.md](AGENTS.md)。

代码和场景数据的授权说明见 [AGENTS.md](AGENTS.md#文档与交付)，第三方许可证位于 `public/licenses/`。
