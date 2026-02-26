import * as path from 'path';
import { exists, mkdirp, readText, writeText } from './io';
import { splitSlnProjects, parseWebsites, parseCSharpProjects } from './parser';
import { resolveDlls, materializeRefs } from './resolver';
import { generateFakeCsproj } from './generator';
import { buildFakeSln } from './sln';
import { CliOptions, Mode } from './types';

function usage(): void {
  console.log('用法: sln2csproj <path-to-sln> [--pick N] [--outDir tools/_intellisense] [--mode copy|link] [--check] [--verbose] [--help]');
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
    console.error(`❌ 找不到檔案: ${slnAbs}`);
    process.exit(1);
  }

  const slnDir = path.dirname(slnAbs);
  const outRootAbs = path.resolve(slnDir, opt.outDir || path.join('tools', '_intellisense'));
  mkdirp(outRootAbs);

  const slnContent = readText(slnAbs);
  const blocks = splitSlnProjects(slnContent);

  const websites = parseWebsites(blocks);
  if (websites.length === 0) {
    console.error('❌ 找不到 Website Project（這個 .sln 可能不是 WebSite 類型）');
    process.exit(1);
  }

  if (opt.check) {
    console.log('✅ Website Projects:');
    websites.forEach((w, i) => {
      console.log(`${i + 1}. ${w.name}`);
      console.log(`   PhysicalPath: ${w.physicalPath}`);
      console.log(`   Framework: ${w.targetFramework}`);
    });
    if (websites.length > 1) {
      console.log('\n💡 多個 Website project，請用 --pick N 指定');
      process.exit(2);
    }
    process.exit(0);
  }

  const pickIndex = Math.max(0, (opt.pick ?? 1) - 1);
  const website = websites[Math.min(pickIndex, websites.length - 1)];

  const csharpProjects = parseCSharpProjects(blocks);

  // Resolve dll absolute locations (best effort)
  resolveDlls(slnDir, website, csharpProjects);

  // Prepare fake output folder: tools/_intellisense/<WebsiteName>/
  const safeName = website.name.replace(/[<>:"/\\|?*]+/g, '_');
  const fakeDirAbs = path.join(outRootAbs, safeName);
  mkdirp(fakeDirAbs);

  const websiteAbs = path.join(slnDir, website.physicalPath);
  const websiteRelFromFake = path.relative(fakeDirAbs, websiteAbs).replace(/\//g, '\\') || '.';

  const mode: Mode = opt.mode || 'copy';
  const refsDirAbs = path.join(fakeDirAbs, 'refs');

  // Decide hint paths
  const hintByDll = materializeRefs(
    mode,
    fakeDirAbs,
    refsDirAbs,
    websiteAbs,
    websiteRelFromFake,
    website
  );

  // Generate csproj at fake folder root
  const csprojContent = generateFakeCsproj(website, websiteRelFromFake, hintByDll);
  const csprojPath = path.join(fakeDirAbs, `${safeName}.intellisense.csproj`);
  writeText(csprojPath, csprojContent);

  // Generate fake sln next to csproj
  const fakeSlnContent = buildFakeSln(slnContent, slnDir, fakeDirAbs, website, csprojPath);
  const fakeSlnPath = path.join(fakeDirAbs, `fake_${safeName}.sln`);
  writeText(fakeSlnPath, fakeSlnContent);

  // Print summary
  console.log(`✅ Website: ${website.name}`);
  console.log(`   PhysicalPath: ${website.physicalPath}`);
  console.log(`   Framework: ${website.targetFramework}`);
  console.log(`✅ Output: ${csprojPath}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   Refs: ${website.projectReferences.length}`);
  console.log(`✅ Fake SLN: ${fakeSlnPath}`);

  if (opt.verbose) {
    console.log('\n📦 Dependencies:');
    for (const ref of website.projectReferences) {
      const hint = hintByDll.get(ref.dllName) || '(none)';
      console.log(`- ${ref.dllName}`);
      console.log(`  from: ${ref.resolvedFrom || ''}`);
      console.log(`  hint: ${hint}`);
    }
  }

  console.log('\n💡 VS Code: 開啟 tools/_intellisense/<WebsiteName>/ 這個資料夾即可（用完整包刪掉）。');
}

main();

