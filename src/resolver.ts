import * as path from 'path';
import { CSharpProject, WebsiteProject, Mode } from './types';
import { exists, readText, mkdirp, copyFile } from './io';

function tryReadCsprojInfo(csprojAbsPath: string): {
  assemblyName?: string;
  debugOutputPath?: string;
  releaseOutputPath?: string;
} {
  if (!exists(csprojAbsPath)) return {};
  const xml = readText(csprojAbsPath);

  const am = xml.match(/<AssemblyName>\s*([^<]+)\s*<\/AssemblyName>/i);
  const assemblyName = am?.[1]?.trim();

  function pick(config: 'Debug' | 'Release'): string | undefined {
    const rg = new RegExp(
      `<PropertyGroup[^>]*Condition="[^"]*${config}\\|AnyCPU[^"]*"[^>]*>[\\s\\S]*?<OutputPath>\\s*([^<]+)\\s*<\\/OutputPath>`,
      'i'
    );
    return xml.match(rg)?.[1]?.trim();
  }

  return { assemblyName, debugOutputPath: pick('Debug'), releaseOutputPath: pick('Release') };
}

function limitedFindDllUnderProject(projDir: string, dllName: string): string | null {
  const candidates = [
    path.join(projDir, 'bin', 'Debug', dllName),
    path.join(projDir, 'bin', 'Release', dllName),
    path.join(projDir, 'bin', dllName),
  ];
  for (const p of candidates) if (exists(p)) return p;
  return null;
}

export function resolveDlls(slnDir: string, website: WebsiteProject, csharpProjects: CSharpProject[]): void {
  const websiteAbs = path.join(slnDir, website.physicalPath);

  for (const ref of website.projectReferences) {
    const proj = csharpProjects.find(p => p.guid.toLowerCase() === ref.guid.toLowerCase());

    if (!proj) {
      const binAbs = path.join(websiteAbs, 'Bin', ref.dllName);
      ref.resolvedAbs = exists(binAbs) ? binAbs : path.join(websiteAbs, 'Bin', ref.dllName);
      ref.resolvedFrom = exists(binAbs) ? 'website:Bin' : 'guess:website Bin';
      continue;
    }

    ref.projectPath = proj.relPath;

    const csprojAbs = path.join(slnDir, proj.relPath);
    const projDirAbs = path.dirname(csprojAbs);

    const info = tryReadCsprojInfo(csprojAbs);
    const assemblyGuess = info.assemblyName ? `${info.assemblyName}.dll` : ref.dllName;

    const byOutputPath = (outRaw: string | undefined): string | null => {
      if (!outRaw) return null;
      const outAbs = path.resolve(projDirAbs, outRaw);
      const a = path.join(outAbs, ref.dllName);
      const b = path.join(outAbs, assemblyGuess);
      if (exists(a)) return a;
      if (exists(b)) return b;
      return a; // guess path (may not exist)
    };

    let dllAbs = byOutputPath(info.debugOutputPath);
    let from = 'csproj:Debug OutputPath';

    if (dllAbs && !exists(dllAbs)) {
      const rel = byOutputPath(info.releaseOutputPath);
      if (rel) { dllAbs = rel; from = 'csproj:Release OutputPath'; }
    }

    if (!dllAbs || !exists(dllAbs)) {
      const found = limitedFindDllUnderProject(projDirAbs, ref.dllName);
      if (found) { dllAbs = found; from = 'fallback:bin'; }
      else { dllAbs = path.join(projDirAbs, 'bin', 'Debug', ref.dllName); from = 'guess:bin\\Debug'; }
    }

    ref.resolvedAbs = dllAbs;
    ref.resolvedFrom = from;
  }
}

/**
 * mode=copy 時，把 resolvedAbs 存在的 dll 複製到 refsDir，
 * 回傳每個 ref 的 HintPath（相對於 fake project dir）
 */
export function materializeRefs(
  mode: Mode,
  fakeDirAbs: string,
  refsDirAbs: string,
  websiteAbs: string,
  websiteRelFromFake: string,
  website: WebsiteProject
): Map<string, string> {
  const hintByDll = new Map<string, string>();

  if (mode === 'copy') {
    mkdirp(refsDirAbs);

    for (const ref of website.projectReferences) {
      const dllName = ref.dllName;
      const src = ref.resolvedAbs;
      const dst = path.join(refsDirAbs, dllName);

      if (src && exists(src)) {
        try {
          copyFile(src, dst);
          hintByDll.set(dllName, path.relative(fakeDirAbs, dst).replace(/\//g, '\\')); // usually "refs\\X.dll"
        } catch {
          // fallback to link if copy fails
          const linked = path.join(websiteAbs, 'Bin', dllName);
          hintByDll.set(dllName, path.join(websiteRelFromFake, 'Bin', dllName).replace(/\//g, '\\'));
          ref.resolvedFrom = (ref.resolvedFrom || '') + ' + copyFail->link';
        }
      } else {
        // fallback: link to website Bin
        hintByDll.set(dllName, path.join(websiteRelFromFake, 'Bin', dllName).replace(/\//g, '\\'));
        ref.resolvedFrom = (ref.resolvedFrom || '') + ' + missing->link';
      }
    }

    return hintByDll;
  }

  // mode === 'link'
  for (const ref of website.projectReferences) {
    const dllName = ref.dllName;

    // Prefer resolvedAbs if exists, else website Bin
    if (ref.resolvedAbs && exists(ref.resolvedAbs)) {
      hintByDll.set(dllName, path.relative(fakeDirAbs, ref.resolvedAbs).replace(/\//g, '\\'));
    } else {
      hintByDll.set(dllName, path.join(websiteRelFromFake, 'Bin', dllName).replace(/\//g, '\\'));
    }
  }

  return hintByDll;
}
