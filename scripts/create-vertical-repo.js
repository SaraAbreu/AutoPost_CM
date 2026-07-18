#!/usr/bin/env node
// Clona el núcleo de AutoPost CM en una carpeta nueva, lista para convertirse
// en el repo dedicado de un vertical concreto (seguros / inmobiliaria / genérico).
//
// Uso:
//   node scripts/create-vertical-repo.js seguros ../autopost-cm-seguros
//
// Qué hace:
//   1. Copia todo el proyecto a la carpeta destino, excluyendo lo que no debe
//      viajar (node_modules, dist, .git, .env, tmp-uploads).
//   2. Renombra el proyecto en package.json según el vertical.
//   3. Preselecciona el vertical en server/profile.json (perfil vacío, listo
//      para rellenar con los datos del cliente real de ese repo) y resetea
//      voice.json / reviews.json a estado limpio (no arrastrar datos de otro cliente).
//   4. Imprime los siguientes pasos manuales (npm install, git init, crear el
//      repo en GitHub, etc.) — este script no toca git ni sube nada a ningún sitio.
//
// Nota: la copia sigue trayendo los 3 módulos en server/modules/ (por si algún
// día quieres reactivar el selector de vertical en ese repo) — lo único que
// cambia es que server/profile.json ya fija el vertical de este repo.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

const VALID_VERTICALS = ['seguros', 'inmobiliaria', 'generico'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'tmp-uploads']);
const EXCLUDE_FILES = new Set(['.env']);

function shouldSkip(relPath) {
  const parts = relPath.split(path.sep);
  if (parts.some(p => EXCLUDE_DIRS.has(p))) return true;
  if (EXCLUDE_FILES.has(parts[parts.length - 1])) return true;
  return false;
}

function copyRecursive(src, dest, root) {
  const rel = path.relative(root, src);
  if (rel && shouldSkip(rel)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), root);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const [, , vertical, targetArg] = process.argv;

  if (!vertical || !VALID_VERTICALS.includes(vertical)) {
    console.error(`Uso: node scripts/create-vertical-repo.js <${VALID_VERTICALS.join('|')}> <carpeta-destino>`);
    process.exit(1);
  }
  if (!targetArg) {
    console.error(`Falta la carpeta destino. Ej: node scripts/create-vertical-repo.js ${vertical} ../autopost-cm-${vertical}`);
    process.exit(1);
  }

  const target = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    console.error(`La carpeta destino "${target}" ya existe y no está vacía. Elige otra o vacíala primero.`);
    process.exit(1);
  }

  console.log(`Clonando el núcleo de AutoPost CM → vertical "${vertical}" en:\n  ${target}\n`);
  copyRecursive(PROJECT_ROOT, target, PROJECT_ROOT);

  // 1. package.json — nombre específico del vertical
  const pkgPath = path.join(target, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = `autopost-cm-${vertical}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 2. profile.json — vertical preseleccionado, resto vacío para el cliente real de este repo
  fs.mkdirSync(path.join(target, 'server'), { recursive: true });
  fs.writeFileSync(
    path.join(target, 'server', 'profile.json'),
    JSON.stringify({ modulo: vertical }, null, 2) + '\n',
    'utf8'
  );

  // 3. voice.json / reviews.json — reset a estado limpio (no arrastrar datos de otro cliente)
  fs.writeFileSync(
    path.join(target, 'server', 'voice.json'),
    JSON.stringify({ examples: [], patterns: null }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(target, 'server', 'reviews.json'),
    JSON.stringify([], null, 2) + '\n',
    'utf8'
  );

  console.log('✅ Copia creada.\n');
  console.log('Siguientes pasos manuales:');
  console.log(`  cd ${targetArg}`);
  console.log('  npm install');
  console.log('  copy .env.example .env   (o "cp" si usas Git Bash/WSL) — y rellena GROQ_API_KEY, etc.');
  console.log(`  git init && git add -A && git commit -m "Repo inicial — vertical ${vertical}"`);
  console.log('  # crea el repo vacío en GitHub y añade el remoto: git remote add origin <url>');
  console.log(`\nEste repo trae los 3 módulos en server/modules/ por si algún día quieres`);
  console.log(`reactivar el selector — pero server/profile.json ya fija "modulo": "${vertical}".`);
}

main();
