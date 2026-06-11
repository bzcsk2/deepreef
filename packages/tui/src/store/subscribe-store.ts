/**
 * 轻量外部 store，供 useSyncExternalStore 订阅。
 */
export class SubscribeStore<T extends object> {
  private state: T;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  /**
   * @param initial - 初始状态
   */
  constructor(initial: T) {
    this.state = initial;
  }

  /**
   * @returns 当前状态快照（勿原地修改）
   */
  getSnapshot(): T {
    return this.state;
  }

  /**
   * @returns 变更版本号
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * 订阅状态变更。
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 局部更新；浅比较后无变化则不通知。
   */
  patch(partial: Partial<T>): void {
    const next = { ...this.state, ...partial };
    if (shallowEqual(this.state, next)) return;
    this.state = next;
    this.notify();
  }

  /**
   * 函数式局部更新。
   */
  update(updater: (prev: T) => Partial<T>): void {
    this.patch(updater(this.state));
  }

  /**
   * 全量替换。
   */
  replace(next: T): void {
    if (shallowEqual(this.state, next)) return;
    this.state = next;
    this.notify();
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as Array<keyof object>;
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if ((a as Record<string, unknown>)[key as string] !== (b as Record<string, unknown>)[key as string]) {
      return false;
    }
  }
  return true;
}
