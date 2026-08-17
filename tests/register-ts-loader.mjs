// Tiny `--import` entrypoint (IMPLEMENTATION-012B) that registers
// `ts-extension-loader.mjs`'s resolve/load hooks before `node --test` loads
// the target test file. Node's customization hooks only take effect for
// modules loaded AFTER `register()` runs, so this must be a separate file
// from the hooks themselves and be passed via `--import`, not `--test`.
import { register } from "node:module"
import { pathToFileURL } from "node:url"

register(new URL("./ts-extension-loader.mjs", import.meta.url).href, pathToFileURL(process.cwd() + "/").href)
