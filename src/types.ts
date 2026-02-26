export interface WebsiteProject {
  name: string;
  guid: string;
  physicalPath: string;      // relative to sln dir
  targetFramework: string;   // normalized like "v3.5"
  projectReferences: ProjectReference[];
}

export interface ProjectReference {
  guid: string;
  dllName: string;

  projectPath?: string;      // relative to sln dir (matched csproj)
  resolvedAbs?: string;      // absolute path to resolved dll (if found/guessed)
  resolvedFrom?: string;     // debug info
}

export interface SlnProjectBlock {
  typeGuid: string;
  name: string;
  relPath: string;
  guid: string;
  rawBlock: string;
}

export interface CSharpProject {
  guid: string;
  name: string;
  relPath: string;           // relative to sln dir
}

export type Mode = 'copy' | 'link';

export interface CliOptions {
  slnPath: string;
  pick?: number;             // 1-based
  outDir?: string;           // default: tools/_intellisense
  mode?: Mode;               // default: copy
  verbose?: boolean;         // default: false
  check?: boolean;           // list websites and exit
  help?: boolean;            // show usage and exit
}
