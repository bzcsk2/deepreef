# `/eval` case 来源说明

最后更新：2026-06-27。

本文件的内容已合并进 [EVAL_MODE.md](EVAL_MODE.md)。

保留这份短文档只是为了兼容旧链接，并强调一个不会变的结论：

1. LoopRig `/eval` 的 MVP case 来源应以 LoopRig native fixtures 为主。
2. Terminal-Bench 和 SWE-bench 适合作为后续精选 case 来源，不适合作为 MVP 前置依赖。
3. harness-evals、LangChain agentevals、agentevals-dev 更适合作为 scorer、baseline、trace evaluator 或兼容层，而不是 `/eval` 的主 case 仓库。

后续开发请直接以 [EVAL_MODE.md](EVAL_MODE.md) 为唯一实施计划。
