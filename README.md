# sln2csproj

Generate a **fake .csproj** for legacy **ASP.NET WebSite Project** in a `.sln`, for VS Code / OmniSharp IntelliSense.

- Non-destructive
- No upgrade / no conversion
- Output is isolated under `tools/_intellisense/<WebsiteName>/`
- Delete the folder to clean up
- Also generates a `fake_<WebsiteName>.sln` next to the fake csproj

## Usage

```bash
npm i
npm run build

# default: mode=copy, output to tools/_intellisense
./bin/sln2csproj.js path/to/Your.sln

# list website projects (help decide --pick, exit code 2 if multiple)\n./bin/sln2csproj.js path/to/Your.sln --check

# multiple websites
./bin/sln2csproj.js path/to/Your.sln --pick 2

# link mode (no copying refs)
./bin/sln2csproj.js path/to/Your.sln --mode link

# verbose (print resolved refs and hint paths)
./bin/sln2csproj.js path/to/Your.sln --verbose

# help
./bin/sln2csproj.js --help
```
```

