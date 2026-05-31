import React, { useState } from 'react';
import { Box, Text, useInput } from '@deepicode/ink';
import type { ChatMessage } from '@deepicode/core';
import type { ToolStatus, ToolCallRecord } from './bridge.js';

interface DeepiMessagesProps {
  messages: ChatMessage[];
  activeTools: Map<string, ToolStatus>;
  toolHistory: ToolCallRecord[];
  isLoading: boolean;
  streamingText: string | null;
  reasoningText?: string | null;
  scrollRef?: React.RefObject<any>;
}

const TRUNCATE_LEN = 200;
const OUTPUT_MAX_LINES = 20;

interface ContentPart {
  type: 'text' | 'code';
  lang?: string;
  content: string;
}

function parseCodeBlocks(text: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || undefined, content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

function MessageContent({ text, isStreaming = false }: { text: string; isStreaming?: boolean }) {
  if (!text) return null;

  if (isStreaming) {
    return <Text wrap="wrap">{text}</Text>;
  }

  const parts = parseCodeBlocks(text);
  if (parts.length === 1 && parts[0].type === 'text') {
    return <Text wrap="wrap">{parts[0].content}</Text>;
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'code') {
          return (
            <Box key={i} backgroundColor="codeBlockBackground" paddingX={1} paddingY={1} marginY={1} flexDirection="column">
              {part.lang && <Text dimColor>{part.lang}</Text>}
              <Text wrap="wrap">{part.content}</Text>
            </Box>
          );
        }
        return <Text key={i} wrap="wrap">{part.content}</Text>;
      })}
    </>
  );
}

export function DeepiMessages({ messages, activeTools, toolHistory, isLoading, streamingText, reasoningText }: DeepiMessagesProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  useInput((_input, key) => {
    if (_input === '\x0f' || (key.ctrl && _input === 'o')) {
      setReasoningOpen(prev => !prev);
    }
  });

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      {messages.map((msg, i) => {
        const key = msg.role + i;
        const isLast = i === messages.length - 1;

        if (msg.role === 'user') {
          return (
            <Box key={key} backgroundColor="userMessageBackground" paddingX={1} paddingY={1} marginBottom={1} flexDirection="column">
              <Box marginBottom={1}>
                <Text bold color="briefLabelYou">You</Text>
              </Box>
              <MessageContent text={msg.content ?? ''} />
            </Box>
          );
        }

        if (msg.role === 'assistant') {
          return (
            <Box key={key} flexDirection="column">
              {isLast && reasoningText && (
                <Box backgroundColor="reasoningBackground" paddingX={1} paddingY={1} marginBottom={1} flexDirection="column">
                  <Box flexDirection="row">
                    <Text color="warning">{reasoningOpen ? '\u25BC' : '\u25B6'}</Text>
                    <Box marginLeft={1}>
                      <Text bold color="warning">Thinking</Text>
                    </Box>
                  </Box>
                  {!reasoningOpen && (
                    <Box paddingLeft={2} marginTop={1}>
                      <Text dimColor>ctrl+o open</Text>
                    </Box>
                  )}
                  {reasoningOpen && (
                    <Box marginTop={1} paddingLeft={2}>
                      <Text dimColor color="warning" wrap="wrap">{reasoningText}</Text>
                    </Box>
                  )}
                </Box>
              )}
              <Box backgroundColor="assistantMessageBackground" paddingX={1} paddingY={1} marginBottom={1} flexDirection="column">
              <Box flexDirection="row" marginBottom={1}>
                <Text color="claude">{'\u25CF'}</Text>
                <Box marginLeft={1}>
                  <Text bold color="briefLabelClaude">Assistant</Text>
                </Box>
              </Box>
              {isLast && streamingText !== null ? (
                <Box>
                  <Text wrap="wrap">{streamingText}</Text>
                  <Text color="success">{'\u258A'}</Text>
                </Box>
              ) : (
                <MessageContent text={msg.content ?? ''} />
              )}
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <Box flexDirection="column" paddingLeft={2} marginTop={1}>
                  {msg.tool_calls.map((tc: any, j: number) => (
                    <Box key={j}>
                      <Text dimColor>  [{tc.function.name}]</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            </Box>
          );
        }

        return null;
      })}

      {toolHistory.length > 0 && (
        <Box backgroundColor="codeBlockBackground" paddingX={1} paddingY={1} marginBottom={1} flexDirection="column">
          {toolHistory.map((tc, i) => {
            const isBash = tc.name === 'bash' || tc.name === 'shell' || tc.name === 'shell_exec';
            const lines = tc.output.split('\n');
            const truncated = lines.length > OUTPUT_MAX_LINES;
            const displayOutput = truncated ? lines.slice(0, OUTPUT_MAX_LINES).join('\n') : tc.output;
            return (
              <Box key={i} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
                {isBash ? (
                  <>
                    {tc.command && (
                      <Box paddingLeft={1}>
                        <Text dimColor>$ {tc.command}</Text>
                      </Box>
                    )}
                    {displayOutput && (
                      <Box paddingLeft={1} marginTop={tc.command ? 0 : undefined}>
                        <Text wrap="wrap">{displayOutput}</Text>
                      </Box>
                    )}
                    {truncated && (
                      <Box paddingLeft={1}>
                        <Text dimColor>... +{lines.length - OUTPUT_MAX_LINES} lines</Text>
                      </Box>
                    )}
                  </>
                ) : (
                  <>
                    <Box flexDirection="row" paddingLeft={1}>
                      <Text bold>{tc.name}</Text>
                    </Box>
                    {tc.output && (
                      <Box paddingLeft={1} marginTop={1}>
                        <Text dimColor wrap="wrap">
                          {tc.output.length > TRUNCATE_LEN ? tc.output.slice(0, TRUNCATE_LEN) + '...' : tc.output}
                        </Text>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {isLoading && activeTools.size > 0 && (
        <Box flexDirection="column" paddingLeft={1} marginTop={1}>
          {Array.from(activeTools.entries()).map(([key, tool]) => (
            <Box key={key}>
              <Text>{tool.status === 'running' ? '\u23BA' : tool.status === 'done' ? '\u2713' : '\u2717'} [{tool.name}]</Text>
            </Box>
          ))}
        </Box>
      )}

      {isLoading && streamingText === null && activeTools.size === 0 && !reasoningText && (
        <Box>
          <Text color="success">{'\u280B'} \u601D\u8003\u4E2D...</Text>
        </Box>
      )}
    </Box>
  );
}
