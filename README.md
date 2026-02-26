# sln2csproj

Generate a fake `.csproj` for legacy ASP.NET WebSite projects found in a `.sln`, so VS Code / C# tooling can provide IntelliSense without converting the original solution.

## What It Does

This tool is for old Visual Studio WebSite solutions that do not have a real `.csproj` for the website itself.

It reads the `.sln`, finds the Website project, and generates:

- a fake website `.csproj`
- a fake `.sln` that points the Website entry to that fake `.csproj`
- reference hint paths for project DLLs and DLLs already present in the website `Bin` folder
- generated WebForms shim `*.g.cs` files under `_intellisense` to fill missing designer fields for IntelliSense

The original solution is not modified.

## Typical Use Case

You have an old VS2005/VS2008/VS2010-era ASP.NET WebSite project.

- Visual Studio can still open it
- VS Code / Roslyn / C# extension cannot resolve the website correctly
- you want IntelliSense only
- you do not want to upgrade or convert the project

## Install

### From npm

```bash
npm install -g sln2csproj
```

Then run:

```bash
sln2csproj path/to/Your.sln
```

Or without global install:

```bash
npx sln2csproj path/to/Your.sln
```

### Local Development

```bash
npm install
npm run build
node ./bin/cli.js path/to/Your.sln
```

## Usage

```text
Usage:
  sln2csproj <solution.sln> [options]

Options:
  --pick <N>        Select Nth Website project if multiple exist
  --outDir <dir>    Output directory (default: tools/_intellisense)
  --mode <copy|link>
                    copy: copy referenced DLLs (default)
                    link: reference original paths only
  --check           List Website projects and exit
  --verbose         Print detailed resolution info
  -h, --help        Show help
```

## Examples

### Default output

```bash
sln2csproj MyApp.sln
```

This writes output under:

```text
<solution-dir>\tools\_intellisense\<WebsiteName>\
```

### Custom output directory

```bash
sln2csproj MyApp.sln --outDir D:\temp\_intellisense
```

If `--outDir` is absolute, output is written there.
If `--outDir` is relative, it is resolved from the solution directory.

### List Website projects first

```bash
sln2csproj MyApp.sln --check
```

Useful when the solution contains more than one Website project.

### Pick the second Website project

```bash
sln2csproj MyApp.sln --pick 2
```

### Link mode

```bash
sln2csproj MyApp.sln --mode link
```

### Verbose output

```bash
sln2csproj MyApp.sln --verbose
```

## New In v0.4.0

- generates WebForms IntelliSense shim files under `_intellisense\<WebsiteName>\generated\`
- fills missing control fields by parsing `.aspx`, `.ascx`, and `.master`
- infers common ASP.NET server control types such as `asp:TextBox`, `asp:Label`, `asp:Button`, and common HTML `runat="server"` controls
- supports single-quoted and unquoted attributes such as `runat=server`
- resolves controls declared through `<%@ Register %>` using:
  - `TagPrefix + Namespace + Assembly`
  - `TagPrefix + TagName + Src`

## Output Structure

Example output:

```text
tools\_intellisense\Project.LegacySys.Web\
  Project.LegacySys.Web.intellisense.csproj
  fake_Project.LegacySys.Web.sln
  generated\
  refs\
```

Files:

- `*.intellisense.csproj`: fake project for IntelliSense
- `fake_*.sln`: rewritten solution that points the Website entry to the fake project
- `generated\`: generated WebForms partial-class shim files used only for IntelliSense
- `refs\`: copied DLLs when `--mode copy` is used and DLL copy succeeds

## Reference Resolution

The generated fake `.csproj` includes:

- standard .NET framework references
- DLLs resolved from `.sln` Website `ProjectReferences`
- DLLs already present in the website `Bin` folder, such as `Newtonsoft.Json.dll`

This matters because many legacy WebSite projects depend on assemblies in `Bin` that are not listed as normal project references in the solution.

## WebForms Shim Generation

The generated fake `.csproj` now also includes generated shim files for WebForms controls.

These files are written only under `_intellisense` and are not added back to the original website.

The shim generator currently:

- reads `Inherits` from `.aspx`, `.ascx`, and `.master`
- scans server controls with `runat="server"` or `runat=server`
- compares discovered control IDs against existing `*.designer.cs` fields
- generates only the missing fields
- maps common server controls to useful .NET types instead of falling back to `System.Web.UI.Control`
- resolves registered custom controls from `<%@ Register %>` directives when possible

Example:

```aspx
<%@ Page Language="C#" Inherits="InsertDataV2" %>
<%@ Register TagPrefix="Custom" Assembly="Project.Library.LegacySysW" Namespace="Project.Library.LegacySys.UI" %>

<asp:Label ID="filterCondition" runat=server></asp:Label>
<Custom:CheckBox ID="chkUse" runat="server" />
```

Can produce IntelliSense-only fields similar to:

```csharp
protected global::System.Web.UI.WebControls.Label filterCondition;
protected global::Project.Library.LegacySys.UI.CheckBox chkUse;
```

This helps reduce false `CS0103` and `CS1061` diagnostics in code-behind files when the original Website project model is incomplete outside Visual Studio.

## `copy` vs `link`

### `--mode copy`

Default mode.

- copies resolved project DLLs into `refs\`
- keeps the fake folder more self-contained
- if DLL copy fails or a DLL is missing, it falls back to linking to the website `Bin` path

### `--mode link`

- does not copy project DLLs
- references original resolved paths directly
- useful when you do not want duplicated files

Note:
DLLs discovered directly from the website `Bin` folder are referenced from their original `Bin` location in both modes.

## VS Code Workflow

After generation:

1. Open the generated folder under `tools/_intellisense/<WebsiteName>/`
2. Let the C# extension load the fake `.sln` / `.csproj`
3. Use IntelliSense against the original website source files
4. Delete that generated website folder when you no longer need it

In practice, deleting only the generated website subfolder is usually enough. You do not need to delete the whole `_intellisense` root.

## Limitations

- This is for IntelliSense, not for real builds
- It does not convert WebSite projects into SDK-style projects
- It does not guarantee every legacy dependency pattern will be inferred
- custom control type inference is heuristic and may still fall back when markup or registrations are unusual
- Some environments may lock generated files while VS Code / OmniSharp is indexing them

## Troubleshooting

### `No Website Project found in the solution.`

The `.sln` may not contain a legacy WebSite project entry, or the format may differ from what this tool supports.

### `Newtonsoft` or another assembly is still unresolved

Check whether the DLL exists in the website `Bin` folder.

This tool now includes `Bin` DLLs in the generated fake project, but if the DLL is missing from `Bin`, IntelliSense still cannot resolve it.

### Cannot delete generated `_intellisense` files

Usually this is not a tool bug. The generated folder is often being used by:

- VS Code
- C# extension / Roslyn / OmniSharp
- file indexers or security tools

Close the generated fake solution/folder first, then delete only the target website subfolder under `_intellisense`.

Deleting `_intellisense\<WebsiteName>\` also removes all generated shim files and restores the original project to its previous state.

### Output inside the project is hard to delete in your environment

Use a custom output path:

```bash
sln2csproj MyApp.sln --outDir D:\temp\_intellisense
```

## Test

```bash
npm test
```

The test suite covers:

- solution parsing
- fake `.csproj` generation
- fake `.sln` rewriting
- Chinese path handling
- disk-based fixture parsing
- CLI integration using a temporary workspace

## Publish

Create a local package tarball:

```bash
npm pack
```

Publish to npm:

```bash
npm publish
```

## GitHub Actions Publish

This repository includes a GitHub Actions workflow at `.github/workflows/publish.yml`.

It runs when:

- you run the workflow manually from GitHub Actions
- you push a tag such as `v0.2.0`

Required setup:

1. Create an npm granular access token with publish permission
2. If your npm account requires it, make sure the token supports bypass 2FA
3. Add the token to the GitHub repository secrets as `NPM_TOKEN`

Suggested release flow:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow will always:

- install dependencies
- run tests
- build a Windows `exe`

When triggered by a version tag such as `v0.4.0`, it will also:

- publish the npm package
- attach the Windows `exe` and `.zip` to the GitHub Release

The Windows executable is built with Node.js Single Executable Applications (SEA), so Windows users can download it from GitHub Releases without installing Node first.
