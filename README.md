# 极简 3D 场景漫游

## 项目介绍

在浏览器中自由探索 3D Gaussian Splatting 场景，支持桌面键鼠和手机双手操作。场景分块逐步加载，可以切换多个场景；支持 WebGPU，并自动回退到 WebGL 2。

网站是纯静态文件，无需后端、登录或数据库。支持具有完整高斯属性的 PLY，不适用于普通 XYZ/RGB 点云。浏览方式为六自由度飞行，不模拟重力或碰撞。

## 安装部署

### 本地运行

需要 Node.js 22.12+ 和 npm，建议使用 `.nvmrc` 中的版本。仓库已有转换好的场景，直接运行即可，无需重新转换或下载源 PLY。

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone git@github.com:urlyy/asoul-concert-3d.git
cd asoul-concert-3d
npm ci
npm run dev
```

仓库访问需要相应的 GitHub 权限；已有本地副本时从 `npm ci` 开始。打开终端显示的网址。需要在同一局域网的手机上浏览时，运行 `npm run dev -- --host 0.0.0.0`，访问终端显示的局域网地址。

### 静态网站 / Cloudflare Pages

```sh
npm run build
npm run preview
```

`preview` 用于本地预览构建结果。部署时上传 **`dist/` 内的全部文件**，可放在域名根目录或 `/tour/` 等子目录，通过 HTTP(S) 访问。

Cloudflare Pages 配置：

| 设置 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| 可选环境变量 | `GIT_LFS_SKIP_SMUDGE=1`，跳过源 PLY 下载 |

`assets/` 中的源 PLY 使用 Git LFS 保存，不参与开发加载或站点打包。网站使用 `public/scenes/` 中的预转换分块，部署时不要选择整个仓库作为输出目录。Cloudflare 的单文件 25 MiB 限制针对发布文件。

### Toy + COS

先把完整的 `public/scenes/` 上传到 COS，并在 `toy-build.config.json` 的 `assetBaseUrl` 中填写对应的 HTTPS 根目录；该地址下应能访问 `scenes/<版本>/lod-meta.json`。资源需要匿名可读，并允许 Toy 页面跨域访问，不能对分块中的 WebP 做图片压缩。

```sh
npm run build:toy
```

将生成的 `dist-toy.zip` 上传到 Toy。该包仅包含前端和配置，场景分块从 COS 加载。构建不会自动上传 COS 或发布 Toy；打包需要系统 `zip` 命令（Windows 可使用 WSL）。新增场景后，先上传分块，再重新打包。

## 使用教程

### 移动与切换场景

桌面点击场景后使用键盘，按住鼠标左键拖拽转头：

| 操作 | 功能 |
| --- | --- |
| W / S | 沿视线前进 / 后退 |
| A / D | 沿机身左右平移 |
| R / F | 沿机身上升 / 下降 |
| Q / E | 左 / 右侧倾 |
| Shift | 按住三倍加速 |
| Home 或「重置」 | 回到初始视角并停止移动 |

手机请横屏：**左手按住方向键移动，右手拖拽场景转头**，两手可以同时操作。「快速」点击开启三倍速度，再点关闭；「升 / 降」和「左倾 / 右倾」按住生效。「全屏」取决于浏览器支持；无法自动横屏时请手动旋转。

前进始终跟随视线，可以翻转和倒飞。松开方向键会短暂减速；「重置」同时关闭快速模式，需松手后重新按键。

点击右上角「场景」选择场景。「重置」返回当前场景自己的起点。

### 加入自己的场景

**1. 准备源文件。** 将从 Gaussian Splatting 工具导出的 `.ply` 放到项目根目录的 `assets/` 中，例如 `assets/我的展厅.ply`。文件名会作为新场景的默认名称。需要的是包含颜色、高斯透明度、缩放和旋转属性的 PLY；普通 XYZ/RGB 点云不能直接使用。

**2. 转换为网页可用的分块。** 在项目根目录执行（首次使用先运行 `npm ci`）：

```sh
npm run convert -- "assets/我的展厅.ply"
```

等待转换完成。程序会生成 `public/scenes/<版本ID>/`，并将新场景追加到 `public/scenes.json`，保留已有场景。不能只把 PLY 放进目录就直接浏览，`npm run dev` 不会自动转换。没有可用 GPU 时，可在转换命令末尾加 `--gpu cpu`。

**3. 预览并设置默认场景。**

```sh
npm run dev
```

打开终端显示的网址，点击右上角「场景」，选择「我的展厅」。新增场景不会自动替换已有默认场景；可在 `public/scenes.json` 中找到新条目，将它的 `id` 复制到文件顶部的 `defaultScene`：

| 字段 | 用途 |
| --- | --- |
| `scenes[].name` | 菜单中显示的名称 |
| `defaultScene` | 默认打开的场景 ID |
| `showSwitcher` | 设为 `false` 隐藏场景切换按钮 |
| `scenes[].camera` | 该场景的初始视角和移动速度 |

ID 和资源路径由转换器生成，不必手写。若菜单被隐藏，先将 `showSwitcher` 改为 `true` 并刷新页面。

**4. 设置初始视角。** 按下一节的 [debug 教程](#设置场景初始视角debug)，在网页中摆好视角，导出 `position`、`quaternion`、`fov`，保存到新场景的 `camera` 中。刷新后确认入口和「重置」效果。

**5. 构建并部署。**

```sh
npm run build
npm run preview
```

确认无误后，按你的部署方式更新：

- **普通静态托管：** 上传完整 `dist/` 内容，不上传源 PLY。
- **Cloudflare Pages + GitHub：** 将 `public/scenes.json` 和新增的完整 `public/scenes/<版本ID>/` 提交并推送，由 Cloudflare 执行构建。即使跳过源 PLY 下载，分块数据也必须提交。
- **Toy + COS：** 先将新增的完整分块目录上传到 COS 的 `scenes/<版本ID>/`，再运行 `npm run build:toy` 并上传新的 ZIP。

保留旧版本分块，避免已打开的页面后续加载失败。修改源 PLY 后需要重新转换；新内容会产生新的版本 ID 和目录条目，已有入口不一定适合新版本，需重新确认。

源 PLY 如果也要备份到 GitHub，先安装 Git LFS 并运行 `git lfs install`，再正常提交 `assets/我的展厅.ply`，仓库规则会将它存入 LFS。仅部署网站不需要上传源 PLY。

需要重新转换仓库内的源文件时，可通过 LFS 下载；使用自己已有的 PLY 不需要这一步：

```sh
git lfs pull --include="assets/*.ply"
```

现有源文件与场景的对应关系见 [assets/README.md](assets/README.md)。

### 设置场景初始视角（debug）

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

以上数字仅为格式示例，请使用你导出的值。不要只保存坐标：旧版 `target` 不能保存侧倾，完整视角需要这三项数据。

5. 刷新页面确认初始视角，点击「重置」验证回到该位置。部署前运行 `npm run build` 并重新上传产物。

修改每个场景的 `camera.moveSpeed` 可调整基础移动速度（世界单位/秒）。其他通用设置位于 `public/viewer-config.json`；不要直接编辑 `dist/`，下次构建会覆盖它。

### 常见问题

| 问题 | 处理 |
| --- | --- |
| 手机竖屏不显示场景 | 关闭系统方向锁定，将手机横过来 |
| 提示缺少高斯属性 | 输入必须是 Gaussian Splatting PLY，不能直接使用普通点云 |
| 转换无法使用 GPU | 在转换命令后加 `--gpu cpu`，速度可能较慢 |
| 场景或数据块加载失败 | 确认完整上传了分块，资源路径和跨域权限正确 |
| Cloudflare 构建缺少场景 | 确认场景目录和对应分块已提交到 GitHub |

开发约定、配置详解、转换原理和测试说明见 [AGENTS.md](AGENTS.md)。项目未指定开源许可证；源场景授权独立于代码依赖，加入仓库不改变授权。第三方许可证随站点保存在 `public/licenses/`。
