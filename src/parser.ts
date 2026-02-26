import { CSharpProject, ProjectReference, SlnProjectBlock, WebsiteProject } from './types';

const WEBSITE_TYPE_GUID = 'E24C65DC-7377-472B-9ABA-BC803B73C61A';
const CSHARP_LEGACY_TYPE_GUID = 'FAE04EC0-301F-11D3-BF4B-00C04F79EFBC';
const CSHARP_SDK_TYPE_GUID = '9A19103F-16F7-4668-BE54-9A1E7A4F7556';

export function splitSlnProjects(slnContent: string): SlnProjectBlock[] {
  const blocks: SlnProjectBlock[] = [];
  const re = /Project\("?\{([0-9A-Fa-f\-]+)\}"?\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{([0-9A-Fa-f\-]+)\}"[\s\S]*?EndProject/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(slnContent)) !== null) {
    blocks.push({
      typeGuid: m[1],
      name: m[2],
      relPath: m[3],
      guid: m[4],
      rawBlock: m[0],
    });
  }
  return blocks;
}

function parseWebsiteProperties(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  const m = block.match(/ProjectSection\(WebsiteProperties\)\s*=\s*preProject([\s\S]*?)EndProjectSection/);
  if (!m) return props;

  for (const line of m[1].split(/\r?\n/)) {
    const lm = line.match(/^\s*([A-Za-z0-9\.\-_]+)\s*=\s*"([^"]*)"\s*$/);
    if (!lm) continue;
    props[lm[1]] = lm[2];
  }
  return props;
}

function normalizeFramework(raw?: string): string {
  if (!raw || !raw.trim()) return 'v3.5';
  const s = raw.trim();
  if (s.startsWith('v')) return s;

  const m1 = s.match(/Version\s*=\s*(v?\d+(\.\d+)?)/i);
  if (m1?.[1]) return m1[1].startsWith('v') ? m1[1] : `v${m1[1]}`;

  if (/^\d+(\.\d+)?$/.test(s)) return `v${s}`;

  const m3 = s.match(/^net(\d)(\d)$/i);
  if (m3) return `v${m3[1]}.${m3[2]}`;

  return 'v3.5';
}

function parseWebsiteProjectReferences(value?: string): ProjectReference[] {
  if (!value) return [];
  return value
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => item.split('|'))
    .filter(parts => parts.length === 2)
    .map(parts => ({
      guid: parts[0].replace(/[{}]/g, '').trim(),
      dllName: parts[1].trim(),
    }));
}

export function parseWebsites(blocks: SlnProjectBlock[]): WebsiteProject[] {
  const websiteBlocks = blocks.filter(b => b.typeGuid.toUpperCase() === WEBSITE_TYPE_GUID);

  return websiteBlocks.map(b => {
    const props = parseWebsiteProperties(b.rawBlock);

    const targetFramework = normalizeFramework(props['TargetFramework'] || props['TargetFrameworkVersion']);

    const physicalPath =
      (props['Debug.AspNetCompiler.PhysicalPath'] ||
        props['Release.AspNetCompiler.PhysicalPath'] ||
        b.relPath)
        .replace(/\\+$/, '')
        .replace(/\/+$/, '');

    return {
      name: b.name,
      guid: b.guid,
      physicalPath,
      targetFramework,
      projectReferences: parseWebsiteProjectReferences(props['ProjectReferences']),
    };
  });
}

export function parseCSharpProjects(blocks: SlnProjectBlock[]): CSharpProject[] {
  return blocks
    .filter(b => {
      const tg = b.typeGuid.toUpperCase();
      return tg === CSHARP_LEGACY_TYPE_GUID || tg === CSHARP_SDK_TYPE_GUID;
    })
    .map(b => ({
      guid: b.guid,
      name: b.name,
      relPath: b.relPath,
    }));
}
