import * as path from 'path';
import { WebsiteProject, SlnProjectBlock } from './types';
import { splitSlnProjects } from './parser';

const CSHARP_LEGACY_TYPE_GUID = 'FAE04EC0-301F-11D3-BF4B-00C04F79EFBC';

function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function isUrlLike(p: string): boolean {
  return /:\/\//.test(p);
}

function adjustRelPath(relPath: string, slnDir: string, fakeSlnDir: string): string {
  if (!relPath) return relPath;
  if (isUrlLike(relPath)) return relPath;
  if (path.isAbsolute(relPath)) return relPath;

  const abs = path.resolve(slnDir, relPath);
  const rel = path.relative(fakeSlnDir, abs) || '.';
  return rel.replace(/\//g, '\\');
}

function replaceProjectPathInBlock(rawBlock: string, newRelPath: string): string {
  const re = /(Project\("?\{[0-9A-Fa-f\-]+\}"?\)\s*=\s*"[^"]+",\s*")([^"]+)(".*)/;
  return rawBlock.replace(re, `$1${newRelPath}$3`);
}

function makeProjectBlock(
  typeGuid: string,
  name: string,
  relPath: string,
  guid: string,
  eol: string
): string {
  return `Project("{${typeGuid}}") = "${name}", "${relPath}", "{${guid}}"${eol}EndProject`;
}

export function buildFakeSln(
  slnContent: string,
  slnDir: string,
  fakeSlnDir: string,
  website: WebsiteProject,
  fakeCsprojAbs: string
): string {
  const blocks = splitSlnProjects(slnContent);
  const eol = detectEol(slnContent);
  let output = slnContent;

  for (const b of blocks) {
    if (b.guid.toLowerCase() === website.guid.toLowerCase()) {
      const rel = path.relative(fakeSlnDir, fakeCsprojAbs).replace(/\//g, '\\') || '.';
      const newBlock = makeProjectBlock(CSHARP_LEGACY_TYPE_GUID, b.name, rel, b.guid, eol);
      output = output.replace(b.rawBlock, newBlock);
      continue;
    }

    const adjusted = adjustRelPath(b.relPath, slnDir, fakeSlnDir);
    const newBlock = replaceProjectPathInBlock(b.rawBlock, adjusted);
    output = output.replace(b.rawBlock, newBlock);
  }

  return output;
}
