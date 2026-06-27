import type { EvalCategory, EvalCategoryId, EvalSuite, EvalSuiteId, EvalCaseRef } from "./types";

const smokeCases: Record<string, EvalCaseRef[]> = {
  "coding-basics": [
    {
      id: "cb-fix-ts-type",
      title: "TypeScript 类型错误修复",
      difficulty: "smoke",
      manifestId: "cb-fix-ts-type",
    },
    {
      id: "cb-fix-json-cli",
      title: "JSON/CLI 解析 bug 修复",
      difficulty: "smoke",
      manifestId: "cb-fix-json-cli",
    },
    {
      id: "cb-fix-test-fail",
      title: "小范围测试失败修复",
      difficulty: "smoke",
      manifestId: "cb-fix-test-fail",
    },
  ],
  "tool-use": [
    {
      id: "tu-search-before-edit",
      title: "必须先搜索再编辑",
      difficulty: "smoke",
      manifestId: "tu-search-before-edit",
    },
    {
      id: "tu-run-verify",
      title: "必须运行验证命令",
      difficulty: "smoke",
      manifestId: "tu-run-verify",
    },
    {
      id: "tu-retry-on-fail",
      title: "命令失败后重试并修正",
      difficulty: "smoke",
      manifestId: "tu-retry-on-fail",
    },
  ],
  safety: [
    {
      id: "sa-no-escape-fixture",
      title: "禁止越权修改 fixture 之外文件",
      difficulty: "smoke",
      manifestId: "sa-no-escape-fixture",
    },
    {
      id: "sa-deny-command",
      title: "遇到 deny 命令必须放弃并说明",
      difficulty: "smoke",
      manifestId: "sa-deny-command",
    },
    {
      id: "sa-readonly-no-diff",
      title: "只读 case 中不得产生写 diff",
      difficulty: "smoke",
      manifestId: "sa-readonly-no-diff",
    },
  ],
};

const smokeSuite: EvalSuite = {
  id: "smoke",
  title: "Smoke Test Suite",
  description: "基础冒烟测试，覆盖各 category 的核心能力验证",
  estimatedMinutes: "10-15",
  cases: [],
};

const CATEGORIES: EvalCategory[] = [
  {
    id: "coding-basics",
    title: "Coding Basics",
    description: "基础编码能力评测：类型修复、bug 修复、测试修复",
    suites: [
      {
        ...smokeSuite,
        cases: smokeCases["coding-basics"],
      },
    ],
  },
  {
    id: "tool-use",
    title: "Tool Use",
    description: "工具使用能力评测：搜索、编辑、命令执行",
    suites: [
      {
        ...smokeSuite,
        cases: smokeCases["tool-use"],
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    description: "安全与约束评测：越权防护、deny 命令处理、只读约束",
    suites: [
      {
        ...smokeSuite,
        cases: smokeCases["safety"],
      },
    ],
  },
];

const CATEGORY_MAP = new Map<EvalCategoryId, EvalCategory>(
  CATEGORIES.map((c) => [c.id, c]),
);

export function getCategories(): EvalCategory[] {
  return CATEGORIES;
}

export function getCategory(id: EvalCategoryId): EvalCategory | undefined {
  return CATEGORY_MAP.get(id);
}

export function getSuite(
  categoryId: EvalCategoryId,
  suiteId: EvalSuiteId,
): EvalSuite | undefined {
  const category = CATEGORY_MAP.get(categoryId);
  if (!category) return undefined;
  return category.suites.find((s) => s.id === suiteId);
}

export function getCaseRef(
  categoryId: EvalCategoryId,
  suiteId: EvalSuiteId,
  caseId: string,
): EvalCaseRef | undefined {
  const suite = getSuite(categoryId, suiteId);
  if (!suite) return undefined;
  return suite.cases.find((c) => c.id === caseId);
}

export function listCaseRefs(
  categoryId: EvalCategoryId,
  suiteId: EvalSuiteId,
): EvalCaseRef[] {
  const suite = getSuite(categoryId, suiteId);
  if (!suite) return [];
  return suite.cases;
}

export function getAvailableCategoryIds(): EvalCategoryId[] {
  return CATEGORIES.map((c) => c.id);
}

export function getAvailableSuiteIds(): EvalSuiteId[] {
  return ["smoke"];
}
