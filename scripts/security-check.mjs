import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const publicGuide = join(root, 'public/assets/clients_guide_lab.pdf');
if (!existsSync(publicGuide)) {
  fail('The public client guide PDF is missing: public/assets/clients_guide_lab.pdf');
}

const publicStandardsDir = join(root, 'public/data/Standards');
if (existsSync(publicStandardsDir)) {
  fail('Restricted standards must not be deployed under public/data/Standards.');
}

const sourceFiles = [join(root, 'index.html'), ...walk(join(root, 'src'))];
const standardUrlPattern = /(?:href|src)=["'][^"']*data\/Standards/i;
for (const file of sourceFiles) {
  if (!/\.(html|ts|tsx|js|jsx)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (standardUrlPattern.test(text)) {
    fail(`Direct public standards URL found in ${file.replace(root, '')}`);
  }
}

const distStandardsDir = join(root, 'dist/data/Standards');
if (existsSync(distStandardsDir)) {
  fail('Build output contains restricted standards under dist/data/Standards.');
}

const distGuide = join(root, 'dist/assets/clients_guide_lab.pdf');
if (existsSync(join(root, 'dist')) && !existsSync(distGuide)) {
  fail('Build output is missing the public client guide PDF.');
}

if (failures.length) {
  console.error('Security check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Security check passed.');
