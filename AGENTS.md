# 项目协作约定

本文件适用于整个项目。先阅读 `README.md` 和本次修改涉及的实现文件，以下说明必须与代码保持一致。

## 目标与边界

- 这是可替换场景的通用 3D Gaussian Splatting 浏览器，不是针对某个演唱会、房间或当前 `assets` 样本定制的页面。
- 核心要求：完整视口的 3D 场景、简洁提示与屏幕按键、桌面/移动端第一人称交互、分块 LOD 渐进加载、纯静态自托管。
- 用户指定手机布局为左手按方向键移动、右手拖拽场景转头，两手可同时操作；屏幕上必须有明确的“重置”按钮。
- 移动端横屏使用；竖屏显示旋转提示，横屏才进入场景。屏幕锁定只在用户手势中尝试，不支持时提示手动旋转；方向变化要停止按住输入。
- 默认不添加侧边栏、仪表盘、后端、登录、数据库、运行时第三方 CDN 或整文件 PLY 加载回退。
- 支持高斯属性完整的 PLY；普通 XYZ/RGB 点云是另一条数据管线。不能仅凭 `.ply` 扩展名宣称兼容所有点云。
- 当前交互按用户最新要求采用六自由度飞行：前后沿机头、左右与升降沿机身局部轴；鼠标/触摸控制局部俯仰和转向，Q/E 或侧倾键控制横滚。使用四元数累积旋转，不锁俯仰角，不再提供飞行/水平模式切换。
- 起点支持 `camera.position` + `camera.quaternion`（`[x, y, z, w]`）保存完整姿态，并用 `camera.fov` 保存视野；四元数优先于旧版 `target`，重置必须保留横滚。
- 后续让用户采集或提供起点时，统一要求 `position`、`quaternion`、`fov` 三项，并给出一次性导出这三项的控制台代码（见 README）。不要再仅索取 `position` / `target`；缺少完整姿态时不能宣称能准确还原用户视角。
- 平移带短暂加减速；界面只提供“重置”回起点，不提供刹停或回正按钮。失焦、触摸取消、竖屏或错误状态不能残留惯性。它是自由飞行浏览器，不包含重力、碰撞或真实穿越机动力学，不宣称完整 FPV 模拟器。

## 工程地图

| 路径 | 责任 |
| --- | --- |
| `index.html` | Canvas、加载/错误状态、操作提示 |
| `src/main.js` | PlayCanvas 初始化、场景加载、通用取景、LOD/分辨率预算、生命周期 |
| `src/controls.js` | 四元数飞行、WASD、R/F、Q/E、加减速、重置和失焦清理 |
| `src/screen-controls.js` | 屏幕飞行/快速模式开关/侧倾/升降/重置、多指输入及取消清理 |
| `src/landscape.js` | 手机竖屏入口、横屏锁定尝试与方向变化处理 |
| `src/style.css` | 全屏布局与最小提示样式 |
| `public/viewer-config.json` | 可提交的默认查看器配置 |
| `public/scenes.json` | 多场景目录、名称、默认场景、每场景入口与切换开关 |
| `scripts/convert.mjs` | 离线 PLY 验证、LOD 生成、SOG 分块、版本和清单发布 |
| `scripts/check-data.mjs` | 构建前检查多场景目录及其索引是否存在（不是全量分块校验） |
| `scripts/build-toy.mjs` | 独立 Toy 构建、外部场景地址注入、体积检查与 ZIP 打包 |
| `toy-build.config.json` | Toy 的 HTTPS 场景资源目录，无凭据 |
| `tests-toy/build.spec.js` / `playwright.toy.config.js` | Toy 产物跨域加载与错误测试，使用本地数据模拟远程响应 |
| `tests/viewer.spec.js` | 构建产物的浏览器交互、流式加载、错误和完整性验证 |
| `tests/screen-controls.spec.js` | 屏幕按键、手机双指、触摸取消、重置、横竖屏布局及场景菜单触摸滚动 |
| `tests/flight.spec.js` | 完整俯仰翻转、横滚、沿机头前进、减速及重置 |
| `playwright.config.js` | 本机 Chrome、单 worker、4173 端口、`/tour/` 子路径 |
| `public/licenses/` | 随站点发布的第三方许可证 |

## 数据与生成物

- `assets/*.ply` 按对应场景名称命名，通过 Git LFS 提交到 GitHub；其他本地素材仍忽略。源 PLY 仅供显式离线转换，不参与 dev、build 或 Toy 打包。不要改写或删除源 PLY 内容，不要从网络擅自下载替代样本；重命名后核对内容哈希。
- `.cache/`、`dist/` 和测试报告是本地生成物，不提交。`public/scenes/` 与 `public/scenes.json` 必须提交，供 Cloudflare 在没有源 PLY 时执行 Vite 构建；分块目录不手工编辑，目录中的名称、起点、默认场景和切换开关可手工配置。
- 修改 `src/`、`public/viewer-config.json` 或 `public/scenes.json` 后构建；不要在 `dist/` 上做源码修复。
- 不硬编码当前样本的文件名、包围盒、空间位置、旋转、地面、裁剪范围或颜色。可由文件元数据/通用数学推导，或由用户配置提供。
- `scenes.json` 必须在新数据转换成功之后追加或更新对应条目。版本目录保持不可变，不自动清理旧版本，避免破坏已打开页面的后续加载。
- 提交场景时确认目录中所有场景引用的完整版本目录已纳入 Git，且没有单文件超过 Cloudflare Pages 的 25 MiB 静态资源限制。源 PLY 只通过 Git LFS 提交到 assets，不能放入 public 或产物。
- 转换器版本与影响输出的参数参与缓存哈希；改变转换算法时更新 `settings.pipeline`，升级转换器时同步 `settings.converter` 和依赖，防止误用旧缓存。
- SOG 中的 WebP 存储数值数据，不能作为普通图片进行有损转码或图片优化。

## 代码与依赖

- 使用 JavaScript ESM、两空格缩进、UTF-8、LF；遵循 `.editorconfig`，延续现有文件风格。
- 保持原生模块与轻量 DOM 结构；没有框架、TypeScript、lint 或格式化脚本，不要报告运行了不存在的检查，也不为普通修改引入整套工具链。
- 使用 npm，保留 `package-lock.json`，依赖版本采用精确版本。正常安装用 `npm ci`；增删或升级依赖时同步 lockfile。
- `.nvmrc` 指定已验证的 Node 版本，`package.json` 声明最低要求。改变支持范围时同步 README。
- 调用 PlayCanvas/SplatTransform API 前检查已安装版本的实现或官方文档，不按其他版本猜测接口。
- 浏览器地址通过站点 base 解析，不能把资源路径写成固定域名根路径。保留根目录和子目录部署能力。
- 图形路径保持 WebGPU 优先和 WebGL 2 回退。事件监听、指针捕获、按键状态和图形资源要有对应清理；隐藏/失焦后不能继续移动。
- 键盘与屏幕输入分开记录，按 pointerId 跟踪每个触摸；一只手松开不能取消另一只手。重置、失焦、触摸取消和销毁必须释放对应状态，不能残留持续移动。按钮触摸目标至少 44×44 CSS 像素。
- 调试能力保持显式启用（当前为 `?debug`）；普通页面不展示统计面板。

## 开发与验证

```sh
npm ci
# 仅添加或重新转换场景时执行：
# npm run convert -- assets/你的文件.ply
npm run dev
npm run build
npm test
```

- 当前 `npm test` 不自动构建或转换，先准备数据并执行 `npm run build`，避免测试旧的 `dist/`。
- 测试使用本机 Google Chrome（`channel: chrome`）和图形支持；默认 Playwright Chromium 下载不能替代这一配置。4173 端口必须可用，测试会自行启停预览服务器。
- 全新检出包含已提交的转换数据，可直接开发、构建和测试；源 PLY 通过 Git LFS 按需拉取，跳过 LFS 下载不影响开发与构建。只有重新转换才需要完整源文件，LFS 指针不能作为 PLY 输入。缺少转换数据时需明确报告，不能宣称完成场景渲染或浏览器测试。
- 运行与修改相称的检查。文档、忽略规则和编辑器配置修改只需核对内容/规则，不必重转大文件或重复整套 GPU 测试。
- 修改渲染/控制器时执行构建与相关浏览器测试，并检查实际画面；修改转换/加载时验证粗略级别可独立显示、原始 PLY 不被请求、缺失资源有明确提示。
- 新测试验证可观察行为，避免仅复制实现细节或依赖当前样本的固定坐标、数量、场景内容。
- 性能报告写明 GPU/浏览器、分辨率、网络和测量方式；本地样本帧率不能当作所有设备或公网的保证。

## 文档与交付

- README 面向已经能访问项目的首次使用者，说明本地运行、操作、导入自己的场景和 debug 起点采集；不讨论仓库私有状态、访问授权或需求变更过程。Toy、COS、Cloudflare 及发布流程放在本文件，不写成用户使用前提。

- 变更命令、配置、键位、输入格式或部署结构时同步 README；目录职责和流程变更时同步本文件。
- 交付说明写清改动、已执行的验证以及真实限制。构建通过不代表已上线，绘制数量预算也不等于总内存硬上限。
- 发布对象是 `dist/` 的内容，包含完整的场景分块和许可证；运行环境不需要 Node.js。
- Toy 例外：`npm run build:toy` 生成被忽略的 `dist-toy/` 和 `dist-toy.zip`，只带前端、目录、配置与许可证；分块需提前上传到 `toy-build.config.json` 指定的目录。普通构建不受影响。Toy 构建不自动上传；`npm run test:toy` 验证已生成的 Toy 包。
- 不擅自选用开源许可证、变更源场景的授权或宣称用户数据可再分发。第三方许可证单独保留。

## 转换细节


转换采用通用流程：验证高斯属性 → 逐级减半直到粗略级别不超过 40,000 个高斯 → 空间分块 → SOG 压缩。最高级保留原始高斯数量和最多 3 阶球谐颜色，SOG 本身会进行有损量化压缩。不会根据场景内容裁剪区域、去背景、改颜色、手调朝向或硬编码相机位置。只按 PLY 的 `Vertical axis` 声明做轴转换；没有声明则假定 Y 向上。

源文件与参数做哈希生成版本目录；重复转换会复用已有结果。新转换成功后才把场景追加到 `scenes.json`。同一源文件与参数重复转换时保留已有名称、朝向和起点。版本目录保持不可变；删除场景条目前，先确认已打开页面的后续分块请求和其他场景不再引用该目录。

可选转换参数：

```sh
# 没有可用 GPU 时使用 CPU 编码（更慢）
npm run convert -- assets/新场景.ply --gpu cpu

# 更小的数据块；减少球谐阶数可以缩小下载量，但会降低视角相关颜色细节
npm run convert -- assets/新场景.ply --chunk-k 64 --coarse-count 20000 --sh-bands 1
```

默认 `--chunk-k 128` 是每块约 128K 个高斯的上限目标，不是生成 128 个文件。实际还按空间跨度切分。大型数据转换需要足够本机内存和临时磁盘空间；转换是离线操作。

## 通用配置


编辑 `public/viewer-config.json` 或 `public/scenes.json` 后重新构建；不要直接修改 `dist/`，以免下次构建覆盖设置。`viewer-config.json` 提供通用默认值，`scenes.json` 的单场景设置优先：

| 配置 | 用途 |
| --- | --- |
| `camera.position` / `camera.target` | 位置及旧版朝向目标，均为 `[x, y, z]`；新入口使用 position、quaternion、fov，target 仅用于兼容 |
| `camera.moveSpeed` | `null` 随场景尺寸确定；也可设世界单位/秒 |
| `camera.quaternion` | 完整起点姿态 `[x, y, z, w]`，包含横滚；优先于 `target`，读取时归一化；必须为非零有限四元数 |
| `camera.fov` | 视野角度，默认 65 |
| `camera.startDistanceScale` | 自动入口距离倍率，默认 `0`，直接位于数据边界中心；`1.08` 约为完整取景距离 |
| `camera.centerHeightOffset` | 中心入口的高度偏移，按包围盒半高计算，默认 `0.25`，避免入口落入地面 |
| `scenes[].rotation` | 每个场景的 `[x, y, z]` 欧拉角（度）；转换时按 PLY 轴声明生成，可手动覆盖 |
| `controls.sensitivity` | 鼠标转头灵敏度 |
| `controls.rollSpeed` | 侧倾角速度，默认 90 度/秒 |
| `controls.response` | 平移速度响应，默认 10，越大加速和变向越快 |
| `controls.damping` | 松手后的减速响应，默认 14，越大停得越快 |
| `performance.desktopBudget` | 桌面目标高斯数量，默认 600,000 |
| `performance.mobileBudget` | 触摸设备目标高斯数量，默认 250,000 |
| `performance.maxPixelRatio` | 渲染像素比上限，默认 1.5 |
| `performance.adaptive` | 持续低帧率时降低绘制预算和分辨率，帧率恢复后逐步回升 |
| `renderer` | `auto` 优先 WebGPU，`webgl2` 强制兼容路径 |

自动入口不会识别“房间入口”、地面或“舞台”。默认 `startDistanceScale: 0` 位于数据包围盒的水平中心，并通过 `centerHeightOffset` 放在几何中心稍上方，朝负 Z 方向；若位置仍不合适，可调整高度偏移或为该场景填写完整的 `position`、`quaternion`、`fov`。相机参数使用轴转换后的 Y 向上坐标。场景朝向修正仅在显示配置中生效，不改写源 PLY 或转换数据。

初始视角采集步骤见 [README：设置场景初始视角](README.md#设置场景初始视角debug)。调试快照同时提供 `sceneId`、渲染器、相机姿态、速度、绘制数量、预算和像素比；必须等场景加载完成后读取。

## 部署实现与缓存

Toy 从外部对象存储加载场景分块，本地运行不依赖对象存储。雨云 ROS 的资源根目录为 `https://cn-nb1.rains3.com/asoul/`；腾讯云 COS（Cloud Object Storage）保留用于旧页面及回退。

### 普通静态部署

```sh
npm run build
npm run preview
```

预览确认后，将 `dist/` 的完整内容上传到静态托管服务。Cloudflare Pages 使用构建命令 `npm run build`、输出目录 `dist`；可在生产和预览环境设置 `GIT_LFS_SKIP_SMUDGE=1`，跳过源 PLY 下载。场景目录与完整分块必须先提交到 GitHub；不将整个仓库作为发布目录。

### Toy 与对象存储发布

将完整的 `public/scenes/` 上传到对象存储，在 `toy-build.config.json` 的 `assetBaseUrl` 设置 HTTPS 根目录，确保该地址下可访问 `scenes/<版本>/lod-meta.json`。雨云采用路径式桶地址，根目录应为 `https://cn-nb1.rains3.com/asoul/`，不要再追加一层 `scenes/`。分块需要匿名可读，并允许 Toy 页面跨域访问。

```sh
npm run build:toy
```

将生成的 `dist-toy.zip` 上传到 Toy。构建不会上传对象存储或发布 Toy。新增场景时，先上传完整的新版本分块，再重新打包并上传 ZIP。

### 雨云 ROS 迁移流程与切换记录

2026-10-23：用户报告曾单日产生约 33GB 访问流量，关注大流量下的成本，要求保留雨云 ROS 的接入方法，待后续明确要求时切换。当时使用腾讯云上海 COS，仅记录方案，未创建雨云资源、上传数据或切换线上地址。

2026-10-27：按用户要求迁移至宁波节点 `https://cn-nb1.rains3.com` 的 `asoul` 桶。已上传并逐文件校验完整的 8 个版本目录（7 个在菜单中，历史版本一并保留），共 1,288 个场景文件、587,803,649 字节；未上传源 PLY。匿名 GET 内容与本地 SHA-256 一致，带 Toy Origin 的响应允许跨域，版本资源返回 `public, max-age=31536000, immutable`。节点实际返回通配 CORS 响应，无需另写桶级 CORS 规则；Toy 内容页实际 Origin 是 `https://www.bilibilitoy.com`，外层入口为 `https://www.bilibili.com`，将来收紧规则时需核对两者。

已更新 `toy-build.config.json`，执行 `npm run build:toy`、`npm run test:toy`（3 项通过）和 Toy 内容预检。真实 Toy 预览在本机 Chrome/WebGPU 中验证了全部 7 个场景的跨域加载与细化、阻断精细请求时粗略 LOD 独立显示，以及默认场景的手机横屏触摸设备模拟；不代表 iPhone/Safari 或 Android 真机验证。现有 Toy 为 `43988002536448`（`A-SOUL 场景重建`，slug `asoul-3d`），用户确认后已通过 Toy CLI 提交雨云版审核，返回状态 `auditing`，本次提交预览为 `https://www.bilibili.com/toy/preview/author_3XS9CMwj/index.html`；前述真实浏览器验证使用同一包体的初次预览 `https://www.bilibili.com/toy/preview/author_YTbC1jJ7/index.html`。尚未确认审核通过或正式入口切换。旧 COS 资源未删除，本机旧包备份于被忽略的 `.cache/toy-rollback/2026-10-27-dist-toy-cos.zip`。审核通过并验证正式入口后更新本记录。

- 雨云支持通过控制台提供的默认 HTTPS 域名公开读取对象，不需要先购买自有域名。使用实际节点端点，不凭示例猜测域名；路径式地址为 `https://<节点域名>/<桶名>/`。
- 优先评估宁波流量套餐。当天公开套餐 API 显示在售月费：10 元含 10GB 存储及 50GB 流量；15 元含 20GB/100GB；24 元含 40GB/200GB；45 元含 80GB/400GB；100 元含 200GB/1024GB。宁波超额流量单价为 0.1 元/GB，超额存储为 0.5 元/GB/月。价格与可售状态在实际切换前重新查询，不把单日峰值当作每天持续用量，不按停售免费套餐估算。来源：[公开套餐 API](https://api.v2.rainyun.com/product/ros/plans)、[默认域名使用教程](https://www.rainyun.com/docs/guide/ros/rainyun-ros-picgo/)。
- Toy 继续承载前端，ROS 仅承载场景分块。文件可公开读取不等同于已验证可托管整个网页；每次迁移都要验证真实 Toy 内容页的跨域加载。

收到切换要求后按以下顺序执行：

1. 确认已有 ROS 实例、区域、桶名、实际 HTTPS 端点和可用上传授权；账号开通或购买由用户完成。上传密钥只通过本机安全配置使用，不能写入仓库、前端、ZIP 或日志。
2. 在目标桶中启用场景对象的匿名读取，上传完整 `public/scenes/`，保留 `scenes/<版本>/...` 结构及所有历史版本。不要上传源 PLY，不要用会删除目标旧文件的同步选项。关闭图片优化，数值 WebP 必须保持原字节。
3. 设置桶的 CORS：允许实际 Toy 预览及发布页面的 Origin 使用 GET、HEAD；如客户端触发预检，允许其实际请求头。先验证 ROS 对默认域名的 CORS 支持，防盗链及防火墙规则也必须允许实际页面请求。配置 `Cache-Control: public, max-age=31536000, immutable` 于版本分块，保留正确的文件类型。
4. 用真实地址验证每个场景的 `lod-meta.json` 和完整分块可读取、文件大小及内容匹配；带实际页面 Origin 检查 CORS 响应。完成实际浏览器跨域加载、粗略 LOD、细化及手机访问检查后再发布，不能只以 HTTP 200 判断成功。
5. 将 `toy-build.config.json` 的 `assetBaseUrl` 改为桶的 HTTPS 目录，末尾保留 `/`，例如 `https://<节点域名>/<桶名>/`；程序会在后面拼接 `scenes/<版本>/...`，不要在该配置末尾重复添加 `scenes/`。路径式桶地址受现有 URL 解析支持，无需改加载器。
6. 执行 `npm run build:toy` 和 `npm run test:toy`，检查生成目录使用新地址；本地模拟测试不能代替对实际 ROS 的跨域和浏览器检查。按用户授权的发布范围更新 Toy ZIP，线上预览及正式入口验证完成后才报告切换成功。只改配置或只构建不代表线上已切换。
7. 保留 COS 完整资源和旧 Toy 包供回退；需要回退时恢复旧 `assetBaseUrl`，重新构建并发布。当前回退地址为 `https://asoul-gaussian-1312521118.cos.ap-shanghai.myqcloud.com/`。旧页面仍可能继续请求 COS，因此迁移后不立即删除旧桶或旧版本。

### 缓存


这是独立小文件的流式加载，普通静态 GET 即可，**不依赖 HTTP Range**。无需 PotreeConverter、服务端转换或 PlayCanvas 账户。开启 HTTPS 可使用 WebGPU；不支持时走 WebGL 2。

建议响应头：

| 路径 | Cache-Control |
| --- | --- |
| `index.html`、`scenes.json`、`viewer-config.json` | `no-cache` |
| `assets/*`、`scenes/<哈希版本>/*` | `public, max-age=31536000, immutable` |

分块内的 WebP 是数值数据，不要让图片 CDN 重新压缩或转码。跨域托管 `scenes` 时需要允许页面域名的 CORS；同域不需要额外设置。

Nginx 示例（替换域名、根路径后使用，下面部署在 `/tour/`）：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/site;
    include mime.types;

    # dist/ 的内容放到 /var/www/site/tour/
    location /tour/ {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }
    location ~ ^/tour/(assets|scenes)/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    gzip on;
    gzip_types application/javascript text/css application/json;
}
```

先上传新版本的分块和 JS/CSS，最后切换入口及 `scenes.json`，或用托管平台的原子部署。缓存只能减少重复传输；浏览器可能清理缓存，不能保证回头永不重复请求。

## 选型与性能边界


PLY 是容器格式。当前输入包含 `opacity`、`scale_*`、`rot_*`、`f_dc_*`、`f_rest_*`，是 3D Gaussian Splatting 数据。

| 方案 | 适用情况 | 本项目选择 |
| --- | --- | --- |
| Potree / PotreeConverter | 普通 XYZ/RGB 测绘点云，多分辨率浏览 | 不用于把高斯数据直接渲染成普通点 |
| 直接加载完整 PLY 的高斯查看器 | 快速预览、小文件 | 不满足大文件按需加载目标 |
| PlayCanvas + Streamed SOG | 保留高斯外观、分块 LOD、预算控制、静态自托管 | 采用 |

此管线支持替换任意具有所需高斯属性的 PLY；**不是普通 XYZ/RGB PLY 的通用转换器**，对不匹配输入会明确报错，原场景保持不变。

加载时先获取索引和粗略数据，随后逐步细化；按相机位置、方向和绘制预算选 LOD，闲置数据会卸载。预算限制绘制目标，**不是总内存的硬上限**；内存还包括压缩数据、排序、纹理及过渡期间的多级数据。小场景或全景视角最终可能请求全部分块，但开始浏览不需要完整下载，更不会请求源 PLY。

历史验证样本（来自原 README，非当前三个源文件的测量，不影响程序配置）：输入 147,999,511 字节 / 627,110 个高斯；转换后 5 级 LOD、12 个数据块，总约 39.6 MB，索引约 34 KB，最粗一级约 1.7 MB。保留了 3 阶球谐。实际加载时间与帧率取决于网络、屏幕分辨率、透明重叠程度和 GPU，不能保证所有设备固定 60 FPS 或一秒首屏。

上述历史样本的本机生产构建测试：Apple M1 Pro、Chrome headless、1280×800、WebGPU、本地 HTTP、全新浏览器上下文。检测到首批可绘制高斯约 320 ms（此时已完成约 5.2 MB 场景请求；引擎并发加载了不止一个粗略级别），连续向前移动 4 秒平均约 60 FPS，95% 帧间隔不超过 16.8 ms。此结果不代表公网速度或场景任意位置的性能。

官方依据：

- [PlayCanvas Streamed SOG：加载及运行时 LOD](https://developer.playcanvas.com/user-manual/gaussian-splatting/building/lod-streaming/)
- [SplatTransform：生成多级分块数据](https://developer.playcanvas.com/user-manual/splat-transform/streamed-sog/)
- [PlayCanvas 高斯渲染性能说明](https://developer.playcanvas.com/user-manual/gaussian-splatting/building/performance/)
- [PotreeConverter](https://github.com/potree/PotreeConverter)

## 浏览器测试说明


```sh
npm run build
npm test
```

浏览器测试使用本机 Google Chrome 和真实 GPU，针对构建后的页面在 `/tour/` 子目录运行：阻断精细块时粗略场景仍可显示和移动；第一人称飞行/升降/转头/Shift 加速/失焦/复位；完整俯仰翻转、侧倾和惯性减速；WebGL 2 兼容路径；缺失索引和分块错误；发布文件完整性及不包含 PLY。测试会自行启动和关闭 4173 端口的预览服务器，失败时把截图和 trace 写入被忽略的 `test-results/`。

`npm test` 不会自动构建；改动代码或配置后需先重新构建。项目目前没有单独的 lint、格式化或类型检查脚本。

`tests/screen-controls.spec.js` 另验证桌面按住/松开屏幕键、手机触摸事件的双指移动与转头、触摸取消、按住移动时点击重置、横屏布局、竖屏提示及屏幕旋转后的状态清理。移动端测试使用 Chrome 的触摸设备模拟，不等同于已经在 iPhone/Safari 或 Android 真机上验证。

`?debug` 会在浏览器控制台提供 `window.__viewer.snapshot()`，用于检查实际渲染器、当前相机、绘制数量和预算。普通页面不显示调试面板。

## 版本管理与构建维护

- `vite.config.js` 使用相对 base；开发服务器拒绝 PLY 访问，忽略 `assets/` 和 `.cache/` 的文件监听。源 `assets/` 不同于 Vite 输出的 `dist/assets/`（JS/CSS 等前端资源）。
- `.gitattributes` 对 `assets/*.ply` 使用 Git LFS。提交源文件前执行 `git lfs install`；确认 `git lfs status` 显示 LFS 对象。原始内容不变时，重命名不会改变场景版本；`conversion.json.sourceName` 保留转换时的历史名称。
- `.gitignore` 排除依赖、构建、缓存、测试报告、日志、环境文件和未声明的本地素材；转换清单的临时文件为 `public/scenes.<pid>.json`。
- 普通 `npm run build` 保持 `check-data.mjs` + Vite，不新增构建后产物检查。`check-data.mjs` 仅校验目录结构和索引是否存在；完整分块验证由已有测试负责。
- Toy 构建需要系统 `zip`，输出 ZIP 根目录直接包含 `index.html`；现有脚本检查解压后总大小及 ZIP 小于 50 MB、入口不超过 1 MB。普通构建不使用这套限制。
- Toy 场景更新后应重新打包目录。只更新对象存储的 `scenes.json` 不会改变 Toy 包内菜单。保留旧版分块，禁止对数值 WebP 做图片优化。
- `npm run test:toy` 使用本地分块模拟远程响应，在 `/tour/` 下验证跨域路径、粗略 LOD 和缺失索引；不代表 Toy 线上预览已通过。
- 缺失分块时恢复完整版本目录，或移走损坏的本地版本目录后重新转换；不能只保留 `conversion.json` 缓存标记。
