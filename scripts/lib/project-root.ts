/**
 * ORCA – Project root (app/) resolution.
 * Works from both scripts/ and dist/scripts/ (compiled output).
 */

import path from 'path'
import fs from 'fs'

let _cached: string | null = null

export function getProjectRoot(): string {
  if (_cached) return _cached
  // When running from dist/scripts/..., .env is at app/ root (parent of dist)
  if (__dirname.includes(path.sep + 'dist' + path.sep) || __dirname.endsWith(path.sep + 'dist')) {
    let d = __dirname
    while (d && !d.endsWith('dist')) d = path.dirname(d)
    _cached = d ? path.dirname(d) : path.resolve(__dirname, '../..')
    return _cached
  }
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    try {
      fs.accessSync(path.join(dir, 'package.json'))
      _cached = dir
      return dir
    } catch {
      dir = path.dirname(dir)
    }
  }
  _cached = path.resolve(__dirname, '..')
  return _cached
}
