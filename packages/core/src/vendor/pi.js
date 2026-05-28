// Runtime wrapper for @oh-my-pi/pi-ai (fork of pi-ai).
// oh-my-pi: github.com/can1357/oh-my-pi
// Source: packages/ai/src/stream.ts
//
// tsx resolves TypeScript imports from .js files, this re-exports from oh-my-pi source.
// tsc uses pi.d.ts for type declarations and skips this .js file.
import { streamSimple, completeSimple } from "../../../../../oh-my-pi/packages/ai/src/stream.ts"

export { streamSimple, completeSimple }
