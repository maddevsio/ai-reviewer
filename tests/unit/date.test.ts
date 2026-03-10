import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDistanceToNow } from '../../src/utils/date';

describe('formatDistanceToNow', () => {
  const NOW = new Date('2025-06-15T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function msAgo(ms: number): Date {
    return new Date(NOW.getTime() - ms);
  }

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('returns "just now" for 0 ms ago', () => {
    expect(formatDistanceToNow(msAgo(0))).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    expect(formatDistanceToNow(msAgo(30 * SECOND))).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    expect(formatDistanceToNow(msAgo(59 * SECOND))).toBe('just now');
  });

  it('returns "1 minute ago" (singular) for exactly 1 minute ago', () => {
    expect(formatDistanceToNow(msAgo(1 * MINUTE))).toBe('1 minute ago');
  });

  it('returns "2 minutes ago" (plural) for 2 minutes ago', () => {
    expect(formatDistanceToNow(msAgo(2 * MINUTE))).toBe('2 minutes ago');
  });

  it('returns "59 minutes ago" for 59 minutes ago', () => {
    expect(formatDistanceToNow(msAgo(59 * MINUTE))).toBe('59 minutes ago');
  });

  it('returns "1 hour ago" (singular) for exactly 1 hour ago', () => {
    expect(formatDistanceToNow(msAgo(1 * HOUR))).toBe('1 hour ago');
  });

  it('returns "2 hours ago" (plural) for 2 hours ago', () => {
    expect(formatDistanceToNow(msAgo(2 * HOUR))).toBe('2 hours ago');
  });

  it('returns "23 hours ago" for 23 hours ago', () => {
    expect(formatDistanceToNow(msAgo(23 * HOUR))).toBe('23 hours ago');
  });

  it('returns "1 day ago" (singular) for exactly 1 day ago', () => {
    expect(formatDistanceToNow(msAgo(1 * DAY))).toBe('1 day ago');
  });

  it('returns "2 days ago" (plural) for 2 days ago', () => {
    expect(formatDistanceToNow(msAgo(2 * DAY))).toBe('2 days ago');
  });

  it('returns "29 days ago" for 29 days ago', () => {
    expect(formatDistanceToNow(msAgo(29 * DAY))).toBe('29 days ago');
  });

  it('returns "1 month ago" for exactly 30 days ago', () => {
    expect(formatDistanceToNow(msAgo(30 * DAY))).toBe('1 month ago');
  });

  it('returns "2 months ago" for 60 days ago', () => {
    expect(formatDistanceToNow(msAgo(60 * DAY))).toBe('2 months ago');
  });

  it('returns "6 months ago" for 180 days ago', () => {
    expect(formatDistanceToNow(msAgo(180 * DAY))).toBe('6 months ago');
  });
});
