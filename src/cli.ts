#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { exists, mkdirp, readText, writeText } from './io';
import { splitSlnProjects, parseWebsites, parseCSharpProjects } from './parser';
import { resolveDlls, materializeRefs } from './resolver';
import { generateFakeCsproj } from './generator';
import { buildFakeSln } from './sln';
import { CliOptions, Mode } from './types';
import { generateWebFormsShimFiles } from './webformsShim';

function collectWebsiteBinHintPaths(websiteAbs: string, websiteRelFromFake: string, hintByDll: Map<string, string>): void {
  const binDirAbs = path.join(websiteAbs, 'Bin');
  if (!exists(binDirAbs)) return;

  const existing = new Set(Array.from(hintByDll.keys(), key => key.toLowerCase()));
  for (const name of fs.readdirSync(binDirAbs)) {
    if (!/\.dll$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (existing.has(key)) continue;

    hintByDll.set(name, path.join(websiteRelFromFake, 'Bin', name).replace(/\//g, '\\'));
    existing.add(key);
  }
}

function usage(): void {
  console.log([
    'Usage:',
    '  sln2csproj <solution.sln> [options]',
    '',
    'Options:',
    '  --pick <N>        Select Nth Website project if multiple exist',
    '  --outDir <dir>    Output directory (default: tools/_intellisense)',
    '  --mode <copy|link>',
    '                    copy: copy referenced DLLs (default)',
    '                    link: reference original paths only',
    '  --check           List Website projects and exit',
    '  --verbose         Print detailed resolution info',
    '  -h, --help        Show help',
    '',
    'Examples:',
    '  sln2csproj MyApp.sln',
    '  sln2csproj MyApp.sln --mode link --verbose',
    '  sln2csproj MyApp.sln --check',
  ].join('\n'));
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const opt: CliOptions = { slnPath: '' };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pick') { opt.pick = parseInt(args[++i], 10); continue; }
    if (a === '--outDir') { opt.outDir = args[++i]; continue; }
    if (a === '--mode') { opt.mode = (args[++i] as Mode) || 'copy'; continue; }
    if (a === '--verbose') { opt.verbose = true; continue; }
    if (a === '--check') { opt.check = true; continue; }
    if (a === '--help' || a === '-h') { opt.help = true; continue; }
    if (!opt.slnPath) opt.slnPath = a;
  }

  return opt;
}

function main() {
  const opt = parseArgs(process.argv);

  if (opt.help) {
    usage();
    process.exit(0);
  }

  if (!opt.slnPath) {
    usage();
    process.exit(1);
  }

  const slnAbs = path.resolve(opt.slnPath);
  if (!exists(slnAbs)) {
    console.error(`File not found: ${slnAbs}`);
    process.exit(1);
  }

  const slnDir = path.dirname(slnAbs);
  const outRootAbs = path.resolve(slnDir, opt.outDir || path.join('tools', '_intellisense'));
  mkdirp(outRootAbs);

  const slnContent = readText(slnAbs);
  const blocks = splitSlnProjects(slnContent);

  const websites = parseWebsites(blocks);
  if (websites.length === 0) {
    console.error('No Website Project found in the solution.');
    process.exit(1);
  }

  if (opt.check) {
    console.log('Website Projects:');
    websites.forEach((w, i) => {
      console.log(`${i + 1}. ${w.name}`);
      console.log(`   PhysicalPath: ${w.physicalPath}`);
      console.log(`   Framework: ${w.targetFramework}`);
    });
    if (websites.length > 1) {
      console.log('\nMultiple Website projects found. Use --pick N to choose one.');
      process.exit(2);
    }
    process.exit(0);
  }

  const pickIndex = Math.max(0, (opt.pick ?? 1) - 1);
  const website = websites[Math.min(pickIndex, websites.length - 1)];

  const csharpProjects = parseCSharpProjects(blocks);
  resolveDlls(slnDir, website, csharpProjects);

  const safeName = website.name.replace(/[<>:"/\\|?*]+/g, '_');
  const fakeDirAbs = path.join(outRootAbs, safeName);
  mkdirp(fakeDirAbs);

  const websiteAbs = path.join(slnDir, website.physicalPath);
  const websiteRelFromFake = path.relative(fakeDirAbs, websiteAbs).replace(/\//g, '\\') || '.';

  for (const ref of website.projectReferences) {
    if (!ref.projectPath) continue;
    ref.projectPath = path.relative(fakeDirAbs, path.resolve(slnDir, ref.projectPath)).replace(/\//g, '\\') || '.';
  }

  const mode: Mode = opt.mode || 'copy';
  const refsDirAbs = path.join(fakeDirAbs, 'refs');

  const hintByDll = materializeRefs(
    mode,
    fakeDirAbs,
    refsDirAbs,
    websiteAbs,
    websiteRelFromFake,
    website
  );
  collectWebsiteBinHintPaths(websiteAbs, websiteRelFromFake, hintByDll);

  const shimResult = generateWebFormsShimFiles(fakeDirAbs, websiteAbs);
  const csprojContent = generateFakeCsproj(
    website,
    websiteRelFromFake,
    hintByDll,
    shimResult.generatedDirName
  );
  const csprojPath = path.join(fakeDirAbs, `${safeName}.intellisense.csproj`);
  writeText(csprojPath, csprojContent);

  const fakeSlnContent = buildFakeSln(slnContent, slnDir, fakeDirAbs, website, csprojPath);
  const fakeSlnPath = path.join(fakeDirAbs, `fake_${safeName}.sln`);
  writeText(fakeSlnPath, fakeSlnContent);

  console.log(`Website: ${website.name}`);
  console.log(`   PhysicalPath: ${website.physicalPath}`);
  console.log(`   Framework: ${website.targetFramework}`);
  console.log(`Output: ${csprojPath}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   Refs: ${website.projectReferences.length}`);
  console.log(`   Shim files: ${shimResult.generatedCount}`);
  console.log(`Fake SLN: ${fakeSlnPath}`);

  if (opt.verbose) {
    console.log('\nDependencies:');
    for (const ref of website.projectReferences) {
      const hint = hintByDll.get(ref.dllName) || '(none)';
      console.log(`- ${ref.dllName}`);
      console.log(`  from: ${ref.resolvedFrom || ''}`);
      console.log(`  hint: ${hint}`);
    }
  }

  console.log('\nVS Code: open tools/_intellisense/<WebsiteName>/ and delete the folder when finished.');
}

main();
