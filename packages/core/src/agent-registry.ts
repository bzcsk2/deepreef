import type { AgentDefinition } from "./agent.js"

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>()
  private arrayCache: AgentDefinition[] | null = null

  register(def: AgentDefinition): void {
    this.agents.set(def.name, def)
    this.arrayCache = null
  }

  get(name: string): AgentDefinition | undefined {
    return this.agents.get(name)
  }

  list(): AgentDefinition[] {
    if (!this.arrayCache) {
      this.arrayCache = Array.from(this.agents.values())
    }
    return this.arrayCache
  }

  snapshot(): Record<string, AgentDefinition> {
    const result: Record<string, AgentDefinition> = {}
    for (const [key, val] of this.agents) {
      result[key] = val
    }
    return result
  }
}

export const defaultAgentRegistry = new AgentRegistry()
