import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Lista os arquivos de `public/` (copiados para o build fora do bundle). */
function publicFiles(dir = 'public'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? publicFiles(path) : [relative('public', path).split(sep).join('/')]
  })
}

/**
 * Gera o service worker no build com a lista exata de arquivos do app,
 * para o PWA funcionar offline depois de instalado. Sem dependências extras.
 */
function serviceWorker(): Plugin {
  return {
    name: 'cor-da-parede:service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = [...Object.keys(bundle), ...publicFiles()].filter((f) => f !== 'sw.js').sort()
      const template = readFileSync('pwa/sw.js', 'utf8')
      // Arquivos com hash no nome + o próprio service worker: qualquer mudança gera cache novo
      const version = createHash('sha256').update(files.join('\n')).update(template).digest('hex').slice(0, 12)
      const precache = ['./', ...files.map((f) => `./${f}`)]
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/** Avisa quando o build inclui catálogos de uso pessoal (*.local.json), que não podem ser publicados. */
function warnPersonalCatalogs(): Plugin {
  return {
    name: 'cor-da-parede:personal-catalogs',
    apply: 'build',
    buildStart() {
      const local = readdirSync('src/data').filter((f) => f.endsWith('.local.json'))
      if (local.length) {
        this.warn(
          `Este build inclui catálogos de uso pessoal (${local.join(', ')}). ` +
            'Não publique esta pasta dist/: o deploy público é feito pelo GitHub Actions, sem esses arquivos.',
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Caminhos relativos: funciona em https://usuario.github.io/<repositório>/
  base: './',
  plugins: [react(), serviceWorker(), warnPersonalCatalogs()],
})
