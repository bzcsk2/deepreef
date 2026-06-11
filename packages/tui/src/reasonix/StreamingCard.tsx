/**
 * StreamingCard — 流式输出卡片
 * 实时显示 AI 模型正在生成的文本，包含动画 Spinner。
 * 输入参数：
 *   - text: string，当前已收到的流式文本内容
 *   - done?: boolean，流式输出是否已完成
 *   - aborted?: boolean，用户是否主动终止了流式输出
 *   - startTs: number，流开始时间戳（毫秒），用于计算经过时间
 *   - expanded?: boolean，保留的兼容参数；流式输出始终显示全部内容
 * 内部行为：
 *   - 通过 useInterval 每秒触发重渲染，更新时间显示
 *   - 完成回复和未完成的流式输出使用不同的视觉模板
 */

import { Box, Text, useInterval } from '@deepreef/ink';
import React, { useState, useMemo } from 'react';
import { Card } from './Card.js';
import { CardHeader } from './CardHeader.js';
import { Spinner } from './Spinner.js';
import { Markdown } from './markdown.js';
import { clipToCells } from './text-width.js';
import { FG, TONE } from './tokens.js';
import { t } from '../i18n/index.js';

interface StreamingCardProps {
  text: string;
  done?: boolean;
  aborted?: boolean;
  startTs: number;
  expanded?: boolean;
  title?: string;
  doneTitle?: string;
}

/**
 * 将文本按指定宽度换行，支持中英文字符混合场景
 * @param text 原始文本
 * @param width 每行最大字符数
 * @returns 换行后的行数组
 */
function wrapLines(text: string, width: number): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length <= width) { lines.push(line); continue; }
    let cur = '';
    for (const ch of line) {
      cur += ch;
      if (cur.length >= width) { lines.push(cur); cur = ''; }
    }
    if (cur) lines.push(cur);
  }
  return lines.length > 0 ? lines : [''];
}

export function StreamingCard({ text, done = false, aborted = false, startTs, title, doneTitle }: StreamingCardProps): React.ReactElement {
  // 每 1000ms 触发一次重渲染，用于更新经过时间显示
  const [, setTick] = useState(0);
  useInterval(() => setTick(t => t + 1), 1000);

  const elapsedMs = Date.now() - startTs;
  const elapsedSec = Math.floor(elapsedMs / 1000);

  // 获取终端列数并计算每行可用字符数（减去两侧边距）
  const cols = process.stdout.columns ?? 80;
  const lineCells = Math.max(20, cols - 4);
  const allLines = useMemo(() => wrapLines(text, lineCells), [text, lineCells]);

  const headColor = aborted ? TONE.err : TONE.brand;
  const glyph = aborted ? '\u2298' : '\u25CF';
  const headLabel = aborted ? t().aborted : title ?? t().writing;

  // 已完成且未终止：显示完整的 Markdown 渲染结果，不再展示 Spinner
  if (done && !aborted) {
    return (
      <Card>
        <CardHeader
          glyph={'\u2039'}
          tone={TONE.ok}
          title={doneTitle ?? t().reply}
          right={elapsedSec > 0 ? <Text dimColor>{`${elapsedSec}s`}</Text> : undefined}
        />
        <Markdown text={text} />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        glyph={glyph}
        tone={headColor}
        title={headLabel}
        right={
          <>
            {elapsedSec > 0 && <Text dimColor>{`${elapsedSec}s`}</Text>}
            {!aborted && <Spinner kind="braille" color={TONE.brand} />}
          </>
        }
      />
      {allLines.map((line, i) => (
        <Box key={i} flexDirection="row">
          <Text color={aborted ? FG.meta : FG.body}>{clipToCells(line, lineCells)}</Text>
          {!aborted && i === allLines.length - 1 && <Text color={TONE.ok}>{'\u258A'}</Text>}
        </Box>
      ))}
      {aborted && <Text color={FG.faint}>{t().truncatedByEsc}</Text>}
    </Card>
  );
}
