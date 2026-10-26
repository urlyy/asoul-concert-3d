# 场景源文件（Git LFS）

本目录保存 **3D Gaussian Splatting PLY**，文件名与 `public/scenes.json` 中的场景名称一致：

| 源文件 | 场景 ID |
| --- | --- |
| `客厅.ply` | `c5d42007f18982f05371` |
| `26年嘉然线下演唱会.ply` | `931411c8c25cc7f39874` |
| `26年贝拉线下演唱会-白天.ply` | `67d5e50fc8e96cf23fb7` |
| `26年贝拉线下演唱会-晚上.ply` | `e805fe7d70e48c87bf6d` |
| `26年团线下-一楼.ply` | `26cf9a1da51f2aa75143` |
| `26年团线下-二楼.ply` | `ac915831bf0760ed5d5d` |
| `26年团线下-宝可梦.ply` | `0e3de3718003d5303632` |

PLY 通过 Git LFS 备份到 GitHub，不进入网站产物。`npm run dev` 不转换、不读取、不监听这些源文件，并禁止通过开发服务器下载 PLY；普通构建和 Toy 构建都只使用预转换的场景数据。

安装 Git LFS 后，需要源数据时执行：

```sh
git lfs install
git lfs pull --include="assets/*.ply"
```

仅浏览和构建时可以跳过 LFS 下载。重新转换需完整的二进制源文件，不能用 LFS 指针文本代替：

```sh
npm ci
npm run convert -- "assets/26年贝拉线下演唱会-白天.ply"
npm run dev
```

路径有空格时加引号。目录里只有一个 PLY 时可以省略文件参数；有多个时需要明确指定。源数据需包含 `x/y/z`、`f_dc_0/1/2`、`opacity`、`scale_0/1/2`、`rot_0/1/2/3`。普通 XYZ/RGB 点云不适用于当前转换管线。转换只读取源文件，不覆盖或删除。

转换结果写入 `public/scenes/<版本>/`，`public/scenes.json` 保存多场景目录；两者用普通 Git 提交。内容和转换参数决定版本 ID，重命名源文件不改变 ID。版本目录中的 `conversion.json.sourceName` 保留转换时的历史文件名，不随此次重命名改写。

Cloudflare Pages 只发布 `dist/`；不要将源 PLY 放进 `public/`。Cloudflare Pages 的单文件 25 MiB 限制针对发布产物，不针对仓库中的源 PLY。源数据加入 GitHub 不改变其授权。完整流程见 [项目 README](../README.md)。
