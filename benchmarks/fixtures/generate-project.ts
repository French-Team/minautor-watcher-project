import fs from "fs-extra";
import path from "path";

const COMPONENT_NAMES = [
  "AuthController",
  "UserController",
  "ApiController",
  "DataProcessor",
  "EventEmitter",
  "CacheManager",
  "Logger",
  "Router",
  "Middleware",
  "Validator",
  "Serializer",
  "DatabasePool",
  "QueryBuilder",
  "MigrationRunner",
  "JobScheduler",
  "QueueProcessor",
  "WebhookHandler",
  "RateLimiter",
  "SessionManager",
  "TokenService",
];

const METHODS = [
  "initialize",
  "process",
  "validate",
  "transform",
  "handle",
  "execute",
  "configure",
  "authenticate",
  "authorize",
  "serialize",
  "deserialize",
  "connect",
  "disconnect",
  "retry",
  "cleanup",
];

function generateComponent(name: string, index: number): string {
  const methods = METHODS.slice(0, 5 + (index % 5))
    .map(
      (m) =>
        `  async ${m}(input: unknown): Promise<void> {
    // TODO: implement ${m}
    console.log("${name}.${m} called");
  }`
    )
    .join("\n\n");

  return `import { EventEmitter } from "events";

interface ${name}Config {
  enabled: boolean;
  timeout: number;
  retries: number;
}

export class ${name} extends EventEmitter {
  private config: ${name}Config;
  private initialized = false;

  constructor(config: Partial<${name}Config> = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 5000,
      retries: config.retries ?? 3,
    };
  }

  async start(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.emit("started");
  }

${methods}

  async stop(): Promise<void> {
    this.initialized = false;
    this.emit("stopped");
  }

  getStatus(): { initialized: boolean; config: ${name}Config } {
    return { initialized: this.initialized, config: this.config };
  }
}

export default ${name};
`;
}

function generateTestFile(name: string): string {
  return `import { ${name} } from "../src/${name.toLowerCase()}";

describe("${name}", () => {
  let instance: ${name};

  beforeEach(() => {
    instance = new ${name}();
  });

  it("should initialize", async () => {
    await instance.start();
    expect(instance.getStatus().initialized).toBe(true);
  });

  it("should stop", async () => {
    await instance.start();
    await instance.stop();
    expect(instance.getStatus().initialized).toBe(false);
  });
});
`;
}

function generateConfigFile(): string {
  return `{
  "name": "benchmark-project",
  "version": "1.0.0",
  "description": "Fake project for benchmark testing",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "typescript": "^5.0.0"
  }
}
`;
}

export interface GenerateOptions {
  /** Target directory for the fake project */
  targetDir: string;
  /** Number of source files to generate */
  fileCount: number;
  /** Number of subdirectories to spread files into */
  dirCount?: number;
}

export interface GenerateResult {
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  duration: number;
}

export async function generateProject(
  options: GenerateOptions
): Promise<GenerateResult> {
  const { targetDir, fileCount, dirCount = 10 } = options;
  const startTime = Date.now();

  await fs.ensureDir(targetDir);

  // Create subdirectories
  const dirs: string[] = [];
  for (let i = 0; i < dirCount; i++) {
    const dir = path.join(targetDir, `module-${i}`);
    await fs.ensureDir(dir);
    dirs.push(dir);
  }

  // Create src directory with components
  const srcDir = path.join(targetDir, "src");
  await fs.ensureDir(srcDir);

  // Generate source files
  let totalSize = 0;
  for (let i = 0; i < fileCount; i++) {
    const dir = dirs[i % dirs.length];
    const name = COMPONENT_NAMES[i % COMPONENT_NAMES.length];
    const suffix = i >= COMPONENT_NAMES.length ? `V${i}` : "";
    const fileName = `${name.toLowerCase()}${suffix}.ts`;
    const filePath = path.join(dir, fileName);

    const content = generateComponent(`${name}${suffix}`, i);
    await fs.writeFile(filePath, content, "utf-8");
    totalSize += Buffer.byteLength(content);
  }

  // Generate test files (10% of source files)
  const testDir = path.join(targetDir, "tests");
  await fs.ensureDir(testDir);
  const testCount = Math.max(1, Math.floor(fileCount / 10));
  for (let i = 0; i < testCount; i++) {
    const name = COMPONENT_NAMES[i % COMPONENT_NAMES.length];
    const suffix = i >= COMPONENT_NAMES.length ? `V${i}` : "";
    const filePath = path.join(
      testDir,
      `${name.toLowerCase()}${suffix}.test.ts`
    );

    const content = generateTestFile(`${name}${suffix}`);
    await fs.writeFile(filePath, content, "utf-8");
    totalSize += Buffer.byteLength(content);
  }

  // Generate package.json
  const pkgPath = path.join(targetDir, "package.json");
  const pkgContent = generateConfigFile();
  await fs.writeFile(pkgPath, pkgContent, "utf-8");
  totalSize += Buffer.byteLength(pkgContent);

  // Generate tsconfig.json
  const tsconfigPath = path.join(targetDir, "tsconfig.json");
  const tsconfigContent = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "node",
        outDir: "dist",
        rootDir: "src",
        strict: true,
      },
      include: ["src/**/*"],
    },
    null,
    2
  );
  await fs.writeFile(tsconfigPath, tsconfigContent, "utf-8");
  totalSize += Buffer.byteLength(tsconfigContent);

  return {
    totalFiles: fileCount + testCount + 2, // +2 for package.json and tsconfig.json
    totalDirs: dirCount + 1, // +1 for src
    totalSize,
    duration: Date.now() - startTime,
  };
}

/**
 * Remove a generated project
 */
export async function cleanupProject(targetDir: string): Promise<void> {
  await fs.remove(targetDir);
}
