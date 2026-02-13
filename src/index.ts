#!/usr/bin/env node

const originalEmit = process.emit;
// @ts-expect-error - overriding process.emit to filter out the punycode deprecation warning (DEP0040)
// caused by groq-sdk -> node-fetch@2 -> whatwg-url@5 -> tr46 using the deprecated built-in punycode module.
// No newer groq-sdk version fixes this. Safe to remove once groq-sdk drops node-fetch@2.
process.emit = function (event: string, ...args: unknown[]) {
  if (event === 'warning' && (args[0] as { name?: string })?.name === 'DeprecationWarning'
    && (args[0] as { code?: string })?.code === 'DEP0040') {
    return false;
  }
  return originalEmit.apply(process, [event, ...args] as Parameters<typeof originalEmit>);
};

import { program } from './cli';

program.parse(process.argv);
