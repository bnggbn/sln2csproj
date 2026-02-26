import * as path from 'path';
import { WebsiteProject } from './types';

function esc(s: string): string {
  return s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

/**
 * websiteRelFromFake: 例如 "..\\..\\..\\HCT.WebSite"
 * hintByDll: dllName -> HintPath (relative to fake project dir)
 */
export function generateFakeCsproj(
  website: WebsiteProject,
  websiteRelFromFake: string,
  hintByDll: Map<string, string>
): string {
  const prefix = websiteRelFromFake.replace(/\//g, '\\').replace(/\\+$/, '');

  const compileInclude = esc(path.join(prefix, '**', '*.cs')).replace(/\//g, '\\');
  const compileExclude = [
    path.join(prefix, 'obj', '**'),
    path.join(prefix, 'bin', '**'),
    path.join(prefix, 'Bin', '**'),
    path.join(prefix, 'App_Data', '**'),
    path.join(prefix, 'Packages', '**'),
    path.join(prefix, 'node_modules', '**'),
    path.join(prefix, '**', 'Temporary ASP.NET Files', '**'),
    path.join(prefix, 'Properties', 'AssemblyInfo.cs'),
  ].map(s => s.replace(/\//g, '\\')).join(';');

  const contentPatterns = ['aspx','ascx','master','ashx','asmx','config','asax'].map(ext => {
    const inc = esc(path.join(prefix, '**', `*.${ext}`)).replace(/\//g, '\\');
    return `    <Content Include="${inc}" />`;
  }).join('\n');

  const references = website.projectReferences.map(ref => {
    const includeName = esc(ref.dllName.replace(/\.dll$/i, ''));
    const hint = esc(hintByDll.get(ref.dllName) || path.join(prefix, 'Bin', ref.dllName)).replace(/\//g, '\\');

    return `    <Reference Include="${includeName}">
      <HintPath>${hint}</HintPath>
      <Private>False</Private>
    </Reference>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- ⚠️ 此檔案由 sln2csproj 自動產生 -->
<!-- ⚠️ 僅供 IntelliSense 使用，請勿拿來 build -->
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{${website.guid}}</ProjectGuid>
    <OutputType>Library</OutputType>
    <RootNamespace>${esc(website.name.replace(/\./g, '_'))}</RootNamespace>
    <AssemblyName>${esc(website.name)}</AssemblyName>
    <TargetFrameworkVersion>${esc(website.targetFramework)}</TargetFrameworkVersion>
  </PropertyGroup>

  <ItemGroup>
    <!-- 基本 Framework refs -->
    <Reference Include="System" />
    <Reference Include="System.Data" />
    <Reference Include="System.Drawing" />
    <Reference Include="System.Web" />
    <Reference Include="System.Web.Extensions" />
    <Reference Include="System.Web.Services" />
    <Reference Include="System.Xml" />
    <Reference Include="System.Configuration" />
    <Reference Include="System.Xml.Linq" />

    <!-- 從 sln 解析出的 refs -->
${references}
  </ItemGroup>

  <ItemGroup>
    <Compile Include="${compileInclude}" Exclude="${esc(compileExclude)}" />
  </ItemGroup>

  <ItemGroup>
${contentPatterns}
  </ItemGroup>

  <Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />

  <Target Name="Build">
    <Message Text="[INFO] fake csproj for IntelliSense only" Importance="high" />
  </Target>
</Project>`;
}
