/** Centralized slash command registry — single source of truth for commands. */

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/exit', description: 'exit' },
  { name: '/bye', description: 'exit' },
  { name: '/help', description: 'show help' },
  { name: '/model', description: 'switch provider/model' },
  { name: '/sessions', description: 'browse past sessions' },
  { name: '/agent', description: 'switch agent (deprecated, use dual-role mode)' },
  { name: '/skill', description: 'list loaded skills' },
  { name: '/lang', description: 'switch language' },
  { name: '/status', description: 'show runtime status' },
  { name: '/context', description: 'configure context trimming/compact' },
  { name: '/thinking', description: 'set thinking mode (off/open/high)' },
  { name: '/harness', description: 'set harness strictness (strict/normal/loose)' },
  { name: '/workflow', description: 'switch workflow mode (alone/subagent/loop)' },
  { name: '/goal', description: 'show/set goal status and objective' },
  { name: '/goal edit', description: 'edit goal objective prompt' },
  { name: '/goal pause', description: 'pause goal tracking' },
  { name: '/goal resume', description: 'resume goal tracking' },
  { name: '/goal clear', description: 'clear current goal' },
  { name: '/goal budget', description: 'set token budget for goal' },
  { name: '/goal no-budget', description: 'unlimited token budget' },
];

export function filterCommands(query: string): SlashCommand[] {
  const lower = query.toLowerCase();
  return SLASH_COMMANDS.filter(cmd => cmd.name.startsWith(lower));
}
