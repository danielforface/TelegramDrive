
"use client";

import type { CloudChannelConfigV1, CloudChannelConfigEntry } from '@/types';

/**
 * Normalizes a VFS path to ensure it starts and ends with a slash,
 * and removes duplicate slashes.
 * e.g., "foo/bar" -> "/foo/bar/"
 * e.g., "/foo//bar/" -> "/foo/bar/"
 * e.g., "/" -> "/"
 */
export function normalizePath(path: string): string {
  if (!path) return '/';
  let normalized = path;
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.length > 1 && !normalized.endsWith('/')) {
    normalized = normalized + '/';
  }
  // Remove duplicate slashes
  normalized = normalized.replace(/\/\/+/g, '/');
  return normalized;
}

/**
 * Parses a VFS path from a JSON caption.
 * Expects caption format: {"path": "/your/path/"}
 * Returns the path string (e.g., "/your/path/") or null if invalid.
 */
export function parseVfsPathFromCaption(caption?: string): string | null {
  if (!caption || !caption.trim().startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(caption);
    if (parsed && typeof parsed.path === 'string') {
      return normalizePath(parsed.path);
    }
    return null;
  } catch (e) {
    // console.error("Error parsing VFS caption:", e, "Caption:", caption);
    return null;
  }
}

/**
 * Retrieves the entries (subfolders and files metadata from config) for a given VFS path
 * from the cloud channel configuration.
 * @param config The CloudChannelConfigV1 object.
 * @param path The VFS path (e.g., "/documents/work/"). Must be normalized.
 * @returns The entries object for the path, or null if path is invalid or not found.
 */
export function getEntriesForPath(
  config: CloudChannelConfigV1 | null | undefined,
  path: string
): { [name: string]: CloudChannelConfigEntry } | null {
  if (!config) {
    return null;
  }

  const normalizedPath = normalizePath(path);

  if (normalizedPath === '/') {
    return config.root_entries;
  }

  const segments = normalizedPath.split('/').filter(segment => segment.length > 0);
  let currentEntries = config.root_entries;

  for (const segment of segments) {
    const entry = currentEntries[segment];
    if (!entry || entry.type !== 'folder' || !entry.entries) {
    //   console.error(`Path segment "${segment}" not found or not a folder in config for path "${path}". Current segment entries:`, currentEntries);
      return null; // Path segment not found or is not a folder
    }
    currentEntries = entry.entries;
  }

  return currentEntries;
}

/**
 * Constructs the parent path from a given VFS path.
 * e.g., "/foo/bar/baz/" -> "/foo/bar/"
 * e.g., "/foo/" -> "/"
 * e.g., "/" -> "/"
 */
export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/') {
    return '/';
  }
  const segments = normalized.split('/').filter(s => s.length > 0);
  if (segments.length <= 1) {
    return '/';
  }
  segments.pop(); // Remove the last segment
  return normalizePath(segments.join('/'));
}
