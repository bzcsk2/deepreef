/**
 * PermissionPrompt — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx
 *
 * Three-stage permission flow: permission → always confirmation → reject feedback.
 * Supports once/always/reject with resource pattern display.
 */

import { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from '@deepreef/ink';
import type { PermissionRequest, PermissionReply } from '@deepreef/core';
import { t } from './i18n/index.js';

interface PermissionPromptProps {
  request: PermissionRequest;
  onSelect: (reply: PermissionReply, message?: string) => void;
}

type PermissionStage = "permission" | "always" | "reject";

/**
 * Format tool name and args for display.
 */
function formatToolDisplay(toolName: string, metadata: Record<string, unknown>): string {
  const name = toolName.toLowerCase();

  // Shell commands
  if (name === 'bash' || name === 'shell' || name === 'shell_exec') {
    const cmd = metadata.command ?? metadata.cmd ?? '';
    return typeof cmd === 'string' ? cmd : JSON.stringify(cmd);
  }

  // File paths
  const filePath = metadata.filePath ?? metadata.path ?? metadata.file;
  if (typeof filePath === 'string') {
    return filePath;
  }

  // URLs
  const url = metadata.url ?? metadata.query;
  if (typeof url === 'string') {
    return url;
  }

  return toolName;
}

/**
 * Format permission type for display.
 */
function formatPermissionType(permission: string): string {
  switch (permission) {
    case 'read': return 'Read File';
    case 'edit': return 'Edit File';
    case 'bash':
    case 'shell': return 'Execute Command';
    case 'external_directory': return 'External Directory';
    case 'webfetch': return 'Fetch URL';
    case 'websearch': return 'Web Search';
    case 'task': return 'Spawn Agent';
    default: return permission;
  }
}

export function PermissionPrompt({ request, onSelect }: PermissionPromptProps) {
  const [stage, setStage] = useState<PermissionStage>("permission");
  const [selected, setSelected] = useState(0);
  const [rejectMessage, setRejectMessage] = useState('');
  const alive = useRef(true);

  useEffect(() => { return () => { alive.current = false; }; }, []);

  // Permission stage options
  const permissionOptions = [
    { label: 'Allow Once', value: 'once' as const },
    { label: 'Always Allow', value: 'always' as const },
    { label: 'Reject', value: 'reject' as const },
  ];

  // Always confirmation options
  const alwaysOptions = [
    { label: 'Confirm', value: 'confirm' as const },
    { label: 'Cancel', value: 'cancel' as const },
  ];

  useInput((_input, key) => {
    if (stage === "permission") {
      if (key.upArrow) {
        setSelected(prev => (prev - 1 + permissionOptions.length) % permissionOptions.length);
      } else if (key.downArrow) {
        setSelected(prev => (prev + 1) % permissionOptions.length);
      } else if (key.return) {
        const opt = permissionOptions[selected];
        if (!alive.current) return;

        if (opt.value === 'once') {
          onSelect('once');
        } else if (opt.value === 'always') {
          setStage("always");
          setSelected(0);
        } else {
          onSelect('reject');
        }
      } else if (key.escape) {
        if (alive.current) onSelect('reject');
      }
    } else if (stage === "always") {
      if (key.upArrow) {
        setSelected(prev => (prev - 1 + alwaysOptions.length) % alwaysOptions.length);
      } else if (key.downArrow) {
        setSelected(prev => (prev + 1) % alwaysOptions.length);
      } else if (key.return) {
        const opt = alwaysOptions[selected];
        if (!alive.current) return;

        if (opt.value === 'confirm') {
          onSelect('always');
        } else {
          setStage("permission");
          setSelected(0);
        }
      } else if (key.escape) {
        if (alive.current) {
          setStage("permission");
          setSelected(0);
        }
      }
    } else if (stage === "reject") {
      if (key.escape) {
        if (alive.current) {
          setStage("permission");
          setSelected(0);
          setRejectMessage('');
        }
      } else if (key.return) {
        if (alive.current) {
          onSelect('reject', rejectMessage || undefined);
        }
      }
    }
  });

  const toolDisplay = formatToolDisplay(request.tool?.toolName ?? 'unknown', request.metadata);
  const permissionType = formatPermissionType(request.permission);

  // Always confirmation stage
  if (stage === "always") {
    return (
      <Box flexDirection="column" width="100%" borderStyle="round" borderColor="warning" paddingX={1} paddingY={1} marginBottom={1}>
        <Box marginBottom={1}>
          <Text bold color="warning">{`⚠️  Confirm Always Allow`}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            <Text bold>{request.tool?.toolName}</Text>
            <Text>{` will be automatically approved for patterns:`}</Text>
          </Text>
        </Box>
        {request.patterns.map((pattern, i) => (
          <Box key={i} paddingLeft={1}>
            <Text>{`• ${pattern}`}</Text>
          </Box>
        ))}
        {request.always.length > 0 && (
          <Box marginTop={1} marginBottom={1}>
            <Text dimColor>{`Suggested always patterns: ${request.always.join(', ')}`}</Text>
          </Box>
        )}
        {alwaysOptions.map((opt, i) => (
          <Box key={opt.value} paddingLeft={1}>
            <Text color={i === selected ? 'warning' : undefined}>
              {i === selected ? '▸ ' : '  '}
            </Text>
            <Text bold={i === selected} color={i === selected ? 'warning' : undefined}>
              {opt.label}
            </Text>
          </Box>
        ))}
        <Box marginTop={1} paddingLeft={1}>
          <Text dimColor>{`enter confirm   esc cancel`}</Text>
        </Box>
      </Box>
    );
  }

  // Reject feedback stage
  if (stage === "reject") {
    return (
      <Box flexDirection="column" width="100%" borderStyle="round" borderColor="error" paddingX={1} paddingY={1} marginBottom={1}>
        <Box marginBottom={1}>
          <Text bold color="error">{`❌ Reject Permission`}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            <Text bold>{request.tool?.toolName}</Text>
            <Text>{` will be denied.`}</Text>
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>{`Type a message to explain what to do differently (optional):`}</Text>
        </Box>
        <Box paddingLeft={1} marginBottom={1}>
          <Text color="error">{`> ${rejectMessage}_`}</Text>
        </Box>
        <Box marginTop={1} paddingLeft={1}>
          <Text dimColor>{`enter submit   esc cancel`}</Text>
        </Box>
      </Box>
    );
  }

  // Main permission stage
  return (
    <Box flexDirection="column" width="100%" borderStyle="round" borderColor="warning" paddingX={1} paddingY={1} marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="warning">{`🔐 ${permissionType}`}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          <Text bold>{request.tool?.toolName}</Text>
          <Text>{` wants to:`}</Text>
        </Text>
      </Box>
      <Box paddingLeft={1} marginBottom={1}>
        <Text color="warning">{`$ ${toolDisplay}`}</Text>
      </Box>
      {request.patterns.length > 0 && (
        <Box marginBottom={1}>
          <Text dimColor>{`Patterns: ${request.patterns.join(', ')}`}</Text>
        </Box>
      )}
      {permissionOptions.map((opt, i) => (
        <Box key={opt.value} paddingLeft={1}>
          <Text color={i === selected ? 'warning' : undefined}>
            {i === selected ? '▸ ' : '  '}
          </Text>
          <Text bold={i === selected} color={i === selected ? 'warning' : undefined}>
            {opt.label}
          </Text>
        </Box>
      ))}
      <Box marginTop={1} paddingLeft={1}>
        <Text dimColor>{`↑↓ select   enter confirm   esc reject`}</Text>
      </Box>
    </Box>
  );
}
