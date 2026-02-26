import * as fs from 'fs';

export function readText(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

export function exists(p: string): boolean {
  try { return fs.existsSync(p); } catch { return false; }
}

export function mkdirp(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function writeText(p: string, content: string): void {
  fs.writeFileSync(p, content, 'utf8');
}

export function copyFile(src: string, dst: string): void {
  fs.copyFileSync(src, dst);
}
