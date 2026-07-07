# Generate Work Review Skill

从本机 `~/.codex/sessions` 读取 Codex 主会话，生成中文“任务观察员”工作复盘网页。

## 功能

- 调用时先询问日期范围，例如“2026 年 5 月至今”
- 未指定日期时，默认生成上月 1 日到今天
- 提供每日、每周、项目分类视图
- 统计用户消息、总 token 与有效新增 token
- 生成数据只在本机处理，不上传会话内容
- 生成后的网页支持手动刷新

## 安装

在 Codex 中要求安装：

```text
请从 GitHub 仓库 xueyingwang0613/wxy 的 skills/generate-work-review 路径安装 Skill。
```

也可以使用内置安装脚本：

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo xueyingwang0613/wxy \
  --path skills/generate-work-review
```

## 使用

```text
使用 $generate-work-review 生成 2026 年 5 月到现在的工作复盘网页。
```

如果不提供日期，Skill 会采用“上月 + 本月”的默认范围。

## 隐私

生成器只读取当前用户本机的 Codex session transcript。仓库不包含任何个人会话或已生成复盘数据。
