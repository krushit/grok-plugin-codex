import fs from "node:fs";
import path from "node:path";

export function loadPromptTemplate(rootDir, name) {
  return fs.readFileSync(path.join(rootDir, "prompts", `${name}.md`), "utf8");
}

export function interpolateTemplate(template, variables) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : "";
  });
}

export function loadJsonSchema(rootDir, name) {
  const raw = fs.readFileSync(path.join(rootDir, "schemas", `${name}.json`), "utf8").trim();
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}
