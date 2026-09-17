// Node ESM custom loader (IMPLEMENTATION-012B) — resolves extensionless
// relative TypeScript imports (the style used throughout `orchestrator/*`,
// e.g. `import { createLogger } from "../devLog"`) the way Vite/tsc
// "bundler" moduleResolution does, since plain Node ESM requires explicit
// extensions. Also stubs "@/lib/supabase" (a Vite-only module that reads
// `import.meta.env`, unavailable under plain Node) so pipeline-level
// modules can be imported for real behavioral tests instead of only
// source-text assertions.
//
// Usage: node --import ./tests/register-ts-loader.mjs --test tests/foo.test.mjs
// (see package.json's "test:response-composer-questions" script; the
// separate `register-ts-loader.mjs` is required because Node's `--import`
// does not auto-register a module's exported hooks, only side effects like
// calling `register()` explicitly)
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const CANDIDATES = [".ts", ".tsx", "/index.ts"]
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..")
const LANDING_SRC = path.join(PROJECT_ROOT, "apps", "landing", "src")
const ADMIN_SRC = path.join(PROJECT_ROOT, "apps", "admin", "src")
const SUPABASE_STUB_SPECIFIER = "virtual:supabase-client-stub"

/**
 * `@/` é o alias de cada app pro PRÓPRIO `src/` (config Vite/tsconfig
 * separada em apps/landing e apps/admin — mesmo especifier, raízes
 * diferentes). Resolve com base em ONDE o import aparece (`context.parentURL`),
 * nunca fixo num só app — E2.7-B precisou disso pra testar
 * `apps/admin/src/hooks/useMyEmbaixadora.ts` (que importa `@/context/...`),
 * o primeiro arquivo de admin a usar um `@/` genérico além do
 * `@/lib/supabase` já stubado abaixo. Landing continua resolvendo
 * exatamente como antes (mesmo `LANDING_SRC`) — mudança só adiciona o novo
 * caso, nunca altera o existente.
 */
function srcRootFor(parentURL) {
  if (!parentURL) return LANDING_SRC
  const parentPath = fileURLToPath(parentURL)
  if (parentPath.includes(`${path.sep}apps${path.sep}admin${path.sep}src${path.sep}`)) return ADMIN_SRC
  return LANDING_SRC
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/supabase") {
    return { url: SUPABASE_STUB_SPECIFIER, shortCircuit: true }
  }
  if (specifier.startsWith("@/")) {
    const resolvedBase = path.join(srcRootFor(context.parentURL), specifier.slice(2))
    for (const ext of CANDIDATES) {
      const candidate = resolvedBase + ext
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context)
    }
  }
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const base = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd()
    const resolvedBase = path.resolve(path.dirname(base), specifier)
    // Deliberately NOT gated on `path.extname()` — real files can contain a
    // dot before a TS-only suffix (e.g. `database.types.ts`, imported as
    // `./database.types`), which `path.extname` misreads as a real
    // extension already present. Only the exact literal path missing from
    // disk falls through to the candidate search below.
    if (!existsSync(resolvedBase)) {
      for (const ext of CANDIDATES) {
        const candidate = resolvedBase + ext
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context)
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url === SUPABASE_STUB_SPECIFIER) {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export const supabase = { functions: { invoke: async () => { " +
        "throw new Error('ts-extension-loader stub: agent-ai-gateway/knowledge-service must be injected via aiGateway/knowledgeEngine in tests, never via the real supabase client'); } } };",
    }
  }
  return nextLoad(url, context)
}
