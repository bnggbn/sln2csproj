const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { splitSlnProjects, parseWebsites, parseCSharpProjects } = require('../bin/parser.js');
const { generateFakeCsproj } = require('../bin/generator.js');
const { buildFakeSln } = require('../bin/sln.js');
const { generateWebFormsShimFiles } = require('../bin/webformsShim.js');

const sampleSln = [
  'Microsoft Visual Studio Solution File, Format Version 12.00',
  'Project("{E24C65DC-7377-472B-9ABA-BC803B73C61A}") = "LegacySite", "LegacySite\\\\", "{11111111-1111-1111-1111-111111111111}"',
  '  ProjectSection(WebsiteProperties) = preProject',
  '    TargetFramework = "4.8"',
  '    Debug.AspNetCompiler.PhysicalPath = "LegacySite\\\\"',
  '    ProjectReferences = "{22222222-2222-2222-2222-222222222222}|Legacy.Lib.dll"',
  '  EndProjectSection',
  'EndProject',
  'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Legacy.Lib", "src\\\\Legacy.Lib\\\\Legacy.Lib.csproj", "{22222222-2222-2222-2222-222222222222}"',
  'EndProject',
].join('\r\n');

test('parser finds website and csharp projects from sln blocks', () => {
  const blocks = splitSlnProjects(sampleSln);
  const websites = parseWebsites(blocks);
  const projects = parseCSharpProjects(blocks);

  assert.equal(blocks.length, 2);
  assert.equal(websites.length, 1);
  assert.equal(projects.length, 1);
  assert.equal(websites[0].name, 'LegacySite');
  assert.equal(websites[0].targetFramework, 'v4.8');
  assert.equal(websites[0].projectReferences[0].dllName, 'Legacy.Lib.dll');
  assert.equal(projects[0].relPath, 'src\\\\Legacy.Lib\\\\Legacy.Lib.csproj');
});

test('generator emits hint paths and compile include patterns', () => {
  const website = {
    name: 'Legacy.Site',
    guid: '11111111-1111-1111-1111-111111111111',
    physicalPath: 'LegacySite',
    targetFramework: 'v4.8',
    projectReferences: [{
      guid: '22222222-2222-2222-2222-222222222222',
      dllName: 'Legacy.Lib.dll',
      projectPath: '..\\\\src\\\\Legacy.Lib\\\\Legacy.Lib.csproj',
    }],
  };
  const hintByDll = new Map([
    ['Legacy.Lib.dll', 'refs\\\\Legacy.Lib.dll'],
    ['Newtonsoft.Json.dll', '..\\\\..\\\\LegacySite\\\\Bin\\\\Newtonsoft.Json.dll'],
  ]);

  const xml = generateFakeCsproj(website, '..\\\\..\\\\LegacySite', hintByDll, 'generated');

  assert.match(xml, /<TargetFrameworkVersion>v4\.8<\/TargetFrameworkVersion>/);
  assert.ok(xml.includes('<Compile Include="..\\..\\LegacySite\\**\\*.cs"'));
  assert.ok(xml.includes('<Compile Include="generated\\**\\*.cs"'));
  assert.match(xml, /<ProjectReference Include="\.\.\\\\src\\\\Legacy\.Lib\\\\Legacy\.Lib\.csproj">/);
  assert.match(xml, /<Project>\{22222222-2222-2222-2222-222222222222\}<\/Project>/);
  assert.doesNotMatch(xml, /<HintPath>refs\\\\Legacy\.Lib\.dll<\/HintPath>/);
  assert.match(xml, /<HintPath>\.\.\\\\\.\.\\\\LegacySite\\\\Bin\\\\Newtonsoft\.Json\.dll<\/HintPath>/);
});

test('shim generator creates missing designer fields without touching original website files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-shim-'));
  const fakeDir = path.join(root, '_intellisense');
  const websiteDir = path.join(root, 'LegacySite');
  fs.mkdirSync(websiteDir, { recursive: true });

  fs.writeFileSync(path.join(websiteDir, 'Default.aspx'), [
    '<%@ Page Language="C#" Inherits="Demo.DefaultPage" %>',
    '<asp:TextBox ID="txtName" runat="server" />',
    '<asp:Button runat="server" ID="btnSave" />',
  ].join('\r\n'));
  fs.writeFileSync(path.join(websiteDir, 'Default.aspx.designer.cs'), [
    'namespace Demo {',
    '    public partial class DefaultPage {',
    '        protected global::System.Web.UI.Control txtName;',
    '    }',
    '}',
  ].join('\r\n'));

  const result = generateWebFormsShimFiles(fakeDir, websiteDir);

  assert.equal(result.generatedCount, 1);
  const generatedDir = path.join(fakeDir, 'generated');
  const files = fs.readdirSync(generatedDir);
  assert.equal(files.length, 1);

  const shim = fs.readFileSync(path.join(generatedDir, files[0]), 'utf8');
  assert.match(shim, /public partial class DefaultPage/);
  assert.match(shim, /protected global::System\.Web\.UI\.WebControls\.Button btnSave;/);
  assert.doesNotMatch(shim, /txtName/);
});

test('shim generator infers common asp and html control types and supports single quotes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-shim-types-'));
  const fakeDir = path.join(root, '_intellisense');
  const websiteDir = path.join(root, 'LegacySite');
  fs.mkdirSync(websiteDir, { recursive: true });

  fs.writeFileSync(path.join(websiteDir, 'Edit.aspx'), [
    "<%@ Page Language='C#' Inherits='Demo.EditPage' %>",
    "<asp:TextBox ID='txtName' runat='server' />",
    "<input type='hidden' id='hidValue' runat='server' />",
    "<textarea runat='server' id='txtMemo'></textarea>",
    "<uc1:AddressEditor ID='AddressEditor1' runat='server' />",
  ].join('\r\n'));

  const result = generateWebFormsShimFiles(fakeDir, websiteDir);

  assert.equal(result.generatedCount, 1);
  const generatedDir = path.join(fakeDir, 'generated');
  const files = fs.readdirSync(generatedDir);
  const shim = fs.readFileSync(path.join(generatedDir, files[0]), 'utf8');

  assert.match(shim, /protected global::System\.Web\.UI\.WebControls\.TextBox txtName;/);
  assert.match(shim, /protected global::System\.Web\.UI\.HtmlControls\.HtmlInputHidden hidValue;/);
  assert.match(shim, /protected global::System\.Web\.UI\.HtmlControls\.HtmlTextArea txtMemo;/);
  assert.match(shim, /protected global::System\.Web\.UI\.UserControl AddressEditor1;/);
});

test('shim generator supports unquoted runat attributes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-shim-unquoted-'));
  const fakeDir = path.join(root, '_intellisense');
  const websiteDir = path.join(root, 'LegacySite');
  fs.mkdirSync(websiteDir, { recursive: true });

  fs.writeFileSync(path.join(websiteDir, 'Search.aspx'), [
    '<%@ Page Language="C#" Inherits="Demo.SearchPage" %>',
    '<asp:Label ID="filterCondition" runat=server></asp:Label>',
  ].join('\r\n'));

  const result = generateWebFormsShimFiles(fakeDir, websiteDir);

  assert.equal(result.generatedCount, 1);
  const generatedDir = path.join(fakeDir, 'generated');
  const files = fs.readdirSync(generatedDir);
  const shim = fs.readFileSync(path.join(generatedDir, files[0]), 'utf8');

  assert.match(shim, /protected global::System\.Web\.UI\.WebControls\.Label filterCondition;/);
});

test('shim generator resolves custom controls from Register namespace and assembly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-shim-register-'));
  const fakeDir = path.join(root, '_intellisense');
  const websiteDir = path.join(root, 'LegacySite');
  fs.mkdirSync(websiteDir, { recursive: true });

  fs.writeFileSync(path.join(websiteDir, 'EditorPage.aspx'), [
    '<%@ Page Title="" Language="C#" AutoEventWireup="true" CodeFile="EditorPage.aspx.cs" Inherits="EditorPage" %>',
    '<%@ Register TagPrefix="Custom" Assembly="Project.Library.LegacySysW" Namespace="Project.Library.LegacySys.UI" %>',
    '<Custom:CheckBox ID="chkUse" runat="server" />',
  ].join('\r\n'));

  const result = generateWebFormsShimFiles(fakeDir, websiteDir);

  assert.equal(result.generatedCount, 1);
  const generatedDir = path.join(fakeDir, 'generated');
  const files = fs.readdirSync(generatedDir);
  const shim = fs.readFileSync(path.join(generatedDir, files[0]), 'utf8');

  assert.match(shim, /public partial class EditorPage/);
  assert.match(shim, /protected global::Project\.Library\.LegacySys\.UI\.CheckBox chkUse;/);
});

test('shim generator resolves registered user controls from Src', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sln2csproj-shim-src-'));
  const fakeDir = path.join(root, '_intellisense');
  const websiteDir = path.join(root, 'LegacySite');
  const controlsDir = path.join(websiteDir, 'Controls');
  fs.mkdirSync(controlsDir, { recursive: true });
  fs.writeFileSync(path.join(websiteDir, 'web.config'), '<configuration />');

  fs.writeFileSync(path.join(controlsDir, 'AddressEditor.ascx'), [
    '<%@ Control Language="C#" Inherits="Demo.Controls.AddressEditor" %>',
  ].join('\r\n'));

  fs.writeFileSync(path.join(websiteDir, 'Edit.aspx'), [
    '<%@ Page Language="C#" Inherits="Demo.EditPage" %>',
    '<%@ Register TagPrefix="uc1" TagName="AddressEditor" Src="~/Controls/AddressEditor.ascx" %>',
    '<uc1:AddressEditor ID="AddressEditor1" runat="server" />',
  ].join('\r\n'));

  const result = generateWebFormsShimFiles(fakeDir, websiteDir);

  assert.equal(result.generatedCount, 1);
  const generatedDir = path.join(fakeDir, 'generated');
  const files = fs.readdirSync(generatedDir);
  const shim = fs.readFileSync(path.join(generatedDir, files[0]), 'utf8');

  assert.match(shim, /protected global::Demo\.Controls\.AddressEditor AddressEditor1;/);
});

test('fake sln rewrites website block to generated csproj', () => {
  const website = {
    name: 'LegacySite',
    guid: '11111111-1111-1111-1111-111111111111',
    physicalPath: 'LegacySite',
    targetFramework: 'v4.8',
    projectReferences: [],
  };

  const fake = buildFakeSln(
    sampleSln,
    'D:\\repo',
    'D:\\repo\\tools\\_intellisense\\LegacySite',
    website,
    'D:\\repo\\tools\\_intellisense\\LegacySite\\LegacySite.intellisense.csproj'
  );

  assert.match(fake, /Project\("\{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC\}"\) = "LegacySite", "LegacySite\.intellisense\.csproj"/);
  assert.match(fake, /"\.\.\\\.\.\\\.\.\\src\\Legacy\.Lib\\Legacy\.Lib\.csproj"/);
});

test('parser and generators preserve Chinese paths', () => {
  const chineseSln = [
    'Microsoft Visual Studio Solution File, Format Version 12.00',
    'Project("{E24C65DC-7377-472B-9ABA-BC803B73C61A}") = "中文網站", "中文網站\\\\", "{33333333-3333-3333-3333-333333333333}"',
    '  ProjectSection(WebsiteProperties) = preProject',
    '    TargetFramework = "4.8"',
    '    Debug.AspNetCompiler.PhysicalPath = "網站目錄\\\\"',
    '    ProjectReferences = "{44444444-4444-4444-4444-444444444444}|共用元件.dll"',
    '  EndProjectSection',
    'EndProject',
    'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "共用元件", "程式庫\\\\共用元件.csproj", "{44444444-4444-4444-4444-444444444444}"',
    'EndProject',
  ].join('\r\n');

  const blocks = splitSlnProjects(chineseSln);
  const websites = parseWebsites(blocks);
  const website = websites[0];

  assert.equal(website.name, '中文網站');
  assert.equal(website.physicalPath, '網站目錄');
  assert.equal(website.projectReferences[0].dllName, '共用元件.dll');

  const xml = generateFakeCsproj(
    website,
    '..\\\\工具\\\\網站目錄',
    new Map([['共用元件.dll', 'refs\\\\共用元件.dll']])
  );

  assert.ok(xml.includes('<Compile Include="..\\工具\\網站目錄\\**\\*.cs"'));
  assert.ok(xml.includes('<HintPath>refs\\\\共用元件.dll</HintPath>'));
  assert.ok(xml.includes('<AssemblyName>中文網站</AssemblyName>'));

  const fake = buildFakeSln(
    chineseSln,
    'D:\\專案',
    'D:\\專案\\工具\\_intellisense\\中文網站',
    website,
    'D:\\專案\\工具\\_intellisense\\中文網站\\中文網站.intellisense.csproj'
  );

  assert.match(fake, /Project\("\{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC\}"\) = "中文網站", "中文網站\.intellisense\.csproj"/);
  assert.match(fake, /"\.\.\\\.\.\\\.\.\\程式庫\\共用元件\.csproj"/);
});

test('parser reads full sln fixture from disk', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'full-sample.sln');
  const slnContent = fs.readFileSync(fixturePath, 'utf8');
  const blocks = splitSlnProjects(slnContent);
  const websites = parseWebsites(blocks);
  const projects = parseCSharpProjects(blocks);

  assert.equal(blocks.length, 10);
  assert.equal(websites.length, 1);
  assert.equal(projects.length, 9);

  const website = websites[0];
  assert.equal(website.name, 'Web');
  assert.equal(website.targetFramework, 'v3.5');
  assert.equal(website.physicalPath, 'Web');
  assert.deepEqual(
    website.projectReferences.map(ref => [ref.guid, ref.dllName]),
    [
      ['4562163D-E78A-4C99-AC00-267BA226A15E', 'Library.dll'],
      ['6F0F6E1F-ED34-4CED-82DA-582717E5DCA2', 'AuditTrail.dll'],
    ]
  );

  const auditTrail = projects.find(project => project.name === 'AuditTrail');
  assert.ok(auditTrail);
  assert.equal(auditTrail.relPath, '..\\..\\SharedComponents\\AuditTrail\\AuditTrail.csproj');
});

test('buildFakeSln rewrites full sln fixture correctly', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'full-sample.sln');
  const slnContent = fs.readFileSync(fixturePath, 'utf8');
  const blocks = splitSlnProjects(slnContent);
  const website = parseWebsites(blocks)[0];

  const fake = buildFakeSln(
    slnContent,
    'D:\\repo\\src\\Legacy',
    'D:\\repo\\src\\Legacy\\tools\\_intellisense\\Web',
    website,
    'D:\\repo\\src\\Legacy\\tools\\_intellisense\\Web\\Web.intellisense.csproj'
  );

  assert.match(fake, /Project\("\{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC\}"\) = "Web", "Web\.intellisense\.csproj", "\{51B1519B-199D-4C0D-BA30-11EE0CF967EA\}"/);
  assert.ok(fake.includes('"..\\..\\..\\Library\\Library.csproj"'));
  assert.ok(fake.includes('"..\\..\\..\\..\\..\\SharedComponents\\AuditTrail\\AuditTrail.csproj"'));
  assert.match(fake, /GlobalSection\(SolutionConfigurationPlatforms\) = preSolution/);
  assert.match(fake, /GlobalSection\(ProjectConfigurationPlatforms\) = postSolution/);
});
