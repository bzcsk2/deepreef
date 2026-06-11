/**
 * PermissionService tests — adapted from OpenCode (MIT License).
 */

import { describe, it, expect } from 'vitest'
import { PermissionService } from '../src/permission/service.js'
import { evaluateRules, fromConfig, createSessionRule } from '../src/permission/rules.js'
import { extractShellPatterns } from '../src/permission/patterns/shell.js'
import type { PermissionRule } from '../src/permission/types.js'

describe('PermissionService', () => {
  describe('ask', () => {
    it('creates pending request and returns promise', () => {
      const svc = new PermissionService()
      const promise = svc.ask({
        sessionId: 'sess1',
        permission: 'bash',
        patterns: ['rm -rf /'],
      })
      expect(typeof promise.then).toBe('function')

      const pending = svc.list()
      expect(pending).toHaveLength(1)
      expect(pending[0].sessionId).toBe('sess1')
      expect(pending[0].permission).toBe('bash')
    })
  })

  describe('reply', () => {
    it('resolves promise with once', async () => {
      const svc = new PermissionService()
      const promise = svc.ask({
        sessionId: 'sess1',
        permission: 'bash',
        patterns: ['ls'],
      })
      const req = svc.list()[0]

      setTimeout(() => {
        svc.reply({ requestId: req.id, reply: 'once' })
      }, 0)

      const reply = await promise
      expect(reply).toBe('once')
      expect(svc.list()).toHaveLength(0)
    })

    it('adds session rules on always', async () => {
      const svc = new PermissionService()
      const promise = svc.ask({
        sessionId: 'sess1',
        permission: 'edit',
        patterns: ['src/*.ts'],
      })
      const req = svc.list()[0]

      svc.reply({ requestId: req.id, reply: 'always' })

      const reply = await promise
      expect(reply).toBe('always')

      // Check session rules were added
      const rules = svc.getSessionRules('sess1')
      expect(rules).toHaveLength(1)
      expect(rules[0].permission).toBe('edit')
      expect(rules[0].pattern).toBe('src/*.ts')
      expect(rules[0].action).toBe('allow')
      expect(rules[0].source).toBe('session')
    })

    it('auto-approves matching pending requests on always', async () => {
      const svc = new PermissionService()

      // Create two pending requests with wildcard patterns
      const promise1 = svc.ask({
        sessionId: 'sess1',
        permission: 'edit',
        patterns: ['*'],
      })
      const promise2 = svc.ask({
        sessionId: 'sess1',
        permission: 'edit',
        patterns: ['src/b.ts'],
      })

      const req1 = svc.list()[0]
      const req2 = svc.list()[1]

      // Reply always to first (with wildcard pattern)
      svc.reply({ requestId: req1.id, reply: 'always' })

      // Second should be auto-approved because * matches src/b.ts
      const reply2 = await promise2
      expect(reply2).toBe('once')
    })

    it('rejects all pending on reject', async () => {
      const svc = new PermissionService()

      const promise1 = svc.ask({
        sessionId: 'sess1',
        permission: 'bash',
        patterns: ['cmd1'],
      })
      const promise2 = svc.ask({
        sessionId: 'sess1',
        permission: 'bash',
        patterns: ['cmd2'],
      })

      // Catch unhandled rejections
      promise1.catch(() => {})
      promise2.catch(() => {})

      const req1 = svc.list()[0]

      svc.reply({ requestId: req1.id, reply: 'reject' })

      await expect(promise1).rejects.toThrow('rejected')
      await expect(promise2).rejects.toThrow('rejected')
      expect(svc.list()).toHaveLength(0)
    })

    it('throws for unknown request ID', () => {
      const svc = new PermissionService()
      expect(() => svc.reply({ requestId: 'unknown', reply: 'once' })).toThrow('not found')
    })
  })

  describe('matchesSessionRules', () => {
    it('matches permission and pattern', () => {
      const svc = new PermissionService()
      // Add session rule
      const rule = createSessionRule('edit', 'src/*.ts')
      svc['sessionApproved'].set('sess1', [rule])

      expect(svc.matchesSessionRules({
        id: '1',
        sessionId: 'sess1',
        permission: 'edit',
        patterns: ['src/app.ts'],
        always: [],
        metadata: {},
      })).toBe(true)

      expect(svc.matchesSessionRules({
        id: '2',
        sessionId: 'sess1',
        permission: 'bash',
        patterns: ['ls'],
        always: [],
        metadata: {},
      })).toBe(false)
    })
  })

  describe('interrupt', () => {
    it('rejects all pending for a session', async () => {
      const svc = new PermissionService()
      const promise1 = svc.ask({ sessionId: 'sess1', permission: 'bash', patterns: ['cmd1'] })
      const promise2 = svc.ask({ sessionId: 'sess2', permission: 'bash', patterns: ['cmd2'] })

      promise1.catch(() => {})
      promise2.catch(() => {})

      svc.interrupt('sess1')

      await expect(promise1).rejects.toThrow()
      expect(svc.list()).toHaveLength(1)
      expect(svc.list()[0].sessionId).toBe('sess2')
    })
  })

  describe('shutdown', () => {
    it('rejects all pending', async () => {
      const svc = new PermissionService()
      const promise1 = svc.ask({ sessionId: 'sess1', permission: 'bash', patterns: ['cmd1'] })
      const promise2 = svc.ask({ sessionId: 'sess2', permission: 'bash', patterns: ['cmd2'] })

      promise1.catch(() => {})
      promise2.catch(() => {})

      svc.shutdown()

      await expect(promise1).rejects.toThrow()
      await expect(promise2).rejects.toThrow()
      expect(svc.list()).toHaveLength(0)
    })
  })
})

describe('evaluateRules', () => {
  it('returns ask when no rules match', () => {
    const decision = evaluateRules('bash', 'ls')
    expect(decision).toBe('ask')
  })

  it('returns allow when rule matches', () => {
    const rules: PermissionRule[] = [
      { permission: 'bash', pattern: '*', action: 'allow', source: 'config' },
    ]
    const decision = evaluateRules('bash', 'ls', rules)
    expect(decision).toBe('allow')
  })

  it('returns deny when rule matches', () => {
    const rules: PermissionRule[] = [
      { permission: 'bash', pattern: 'rm -rf *', action: 'deny', source: 'config' },
    ]
    const decision = evaluateRules('bash', 'rm -rf /', rules)
    expect(decision).toBe('deny')
  })

  it('last match wins', () => {
    const rules1: PermissionRule[] = [
      { permission: 'bash', pattern: '*', action: 'allow', source: 'config' },
    ]
    const rules2: PermissionRule[] = [
      { permission: 'bash', pattern: 'rm *', action: 'deny', source: 'config' },
    ]
    const decision = evaluateRules('bash', 'rm -rf /', rules1, rules2)
    expect(decision).toBe('deny')
  })

  it('supports wildcards', () => {
    const rules: PermissionRule[] = [
      { permission: 'edit', pattern: 'src/*.ts', action: 'allow', source: 'config' },
    ]
    expect(evaluateRules('edit', 'src/app.ts', rules)).toBe('allow')
    expect(evaluateRules('edit', 'lib/util.ts', rules)).toBe('ask')
  })
})

describe('fromConfig', () => {
  it('converts config rules to PermissionRule array', () => {
    const rules = fromConfig([
      { permission: 'bash', pattern: 'ls *', action: 'allow' },
      { permission: 'edit', action: 'ask' },
    ])
    expect(rules).toHaveLength(2)
    expect(rules[0].source).toBe('config')
    expect(rules[1].pattern).toBe('*')
  })
})

describe('extractShellPatterns', () => {
  it('extracts patterns from ls command', () => {
    const scan = extractShellPatterns('ls -la /tmp', '/home/user')
    expect(scan.patterns.has('ls')).toBe(true)
  })

  it('extracts patterns from rm command', () => {
    const scan = extractShellPatterns('rm file.txt', '/home/user')
    expect(scan.patterns.has('rm')).toBe(true)
    expect(scan.patterns.has('file.txt')).toBe(true)
  })

  it('handles empty command', () => {
    const scan = extractShellPatterns('', '/home/user')
    expect(scan.patterns.size).toBe(0)
  })
})
