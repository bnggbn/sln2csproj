const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'cli.js');

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-'));
}

test('compiled CLI prints usage with --help', () => {
  const result = spawnSync(process.execPath, [cliPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:\s*\r?\n\s*sln2csproj <solution\.sln> \[options\]/);
  assert.match(result.stdout, /Examples:/);
});

test('package bin points to compiled CLI entry', () => {
  const pkg = require(path.join(repoRoot, 'package.json'));
  assert.equal(pkg.bin.sln2csproj, 'bin/cli.js');
});

test('CLI generates fake csproj and fake sln in a clean temp workspace', () => {
  const tempDir = makeTempWorkspace();

  try {
    const fixturePath = path.join(repoRoot, 'test', 'fixtures', 'full-sample.sln');
    const slnPath = path.join(tempDir, '完整測試.sln');
    const websiteBinDir = path.join(tempDir, 'Web', 'Bin');
    fs.copyFileSync(fixturePath, slnPath);
    fs.mkdirSync(websiteBinDir, { recursive: true });
    fs.writeFileSync(path.join(websiteBinDir, 'Library.dll'), '');
    fs.writeFileSync(path.join(websiteBinDir, 'PII_LOG.DLL.dll'), '');
    fs.writeFileSync(path.join(websiteBinDir, 'Newtonsoft.Json.dll'), '');

    const result = spawnSync(
      process.execPath,
      [cliPath, slnPath, '--mode', 'link', '--outDir', '測試輸出'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const fakeDir = path.join(tempDir, '測試輸出', 'Web');
    const csprojPath = path.join(fakeDir, 'Web.intellisense.csproj');
    const fakeSlnPath = path.join(fakeDir, 'fake_Web.sln');

    assert.ok(fs.existsSync(csprojPath), 'expected generated fake csproj');
    assert.ok(fs.existsSync(fakeSlnPath), 'expected generated fake sln');

    const csproj = fs.readFileSync(csprojPath, 'utf8');
    const fakeSln = fs.readFileSync(fakeSlnPath, 'utf8');

    assert.match(result.stdout, /Website: Web/);
    assert.match(result.stdout, /Mode: link/);
    assert.match(csproj, /<AssemblyName>Web<\/AssemblyName>/);
    assert.match(csproj, /<ProjectReference Include="\.\.\\\.\.\\Library\\Library\.csproj">/);
    assert.doesNotMatch(csproj, /<HintPath>\.\.\\\.\.\\Web\\Bin\\Library\.dll<\/HintPath>/);
    assert.ok(csproj.includes('..\\..\\Web\\Bin\\Newtonsoft.Json.dll'));
    assert.match(fakeSln, /"Web\.intellisense\.csproj"/);
    assert.ok(fakeSln.includes('"..\\..\\Library\\Library.csproj"'));
    assert.ok(fakeSln.includes('"..\\..\\..\\..\\個資紀錄\\PII_LOG.DLL\\PII_LOG.DLL.csproj"'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
