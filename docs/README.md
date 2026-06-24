# DeepReef 文档

最后整理：2026-06-24。

这是 `docs/` 的当前入口。根目录的 `README.md` / `README.zh.md` 面向用户快速了解和安装；本目录面向开发、维护和实现判断。

## 推荐阅读顺序

1. [PROJECT_DESIGN.zh.md](PROJECT_DESIGN.zh.md)：中文总体设计入口。
2. [ARCHITECTURE.md](ARCHITECTURE.md)：按当前代码整理的架构和模块边界。
3. [OPERATIONS.md](OPERATIONS.md)：安装、运行、配置和常用命令。
4. [DEVELOPMENT.md](DEVELOPMENT.md)：本地开发、测试、发布前验证。
5. [STATUS.md](STATUS.md)：当前真实实现状态、已知边界。
6. [TODO.md](TODO.md)：下一步建议工作。
7. [DONE.md](DONE.md)：本次文档整理后的已完成能力摘要。

## 历史资料

旧的长篇 TODO、DONE、专项整改建议已移到 [archive/](archive/)。这些文件保留历史上下文，但不再作为当前状态的权威来源。

当前状态以这些文件为准：

- [STATUS.md](STATUS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [PROJECT_DESIGN.zh.md](PROJECT_DESIGN.zh.md)

## 文档维护规则

- 代码行为变化时，优先更新 `STATUS.md` 和相关专题文档。
- 设计建议、历史验收、阶段性备忘录放入 `archive/`，不要堆在 docs 根目录。
- 不要把“计划实现”写成“已经实现”；未落地能力必须明确标注为待办。
- 配置、命令、工具名、路径必须和当前代码一致。
