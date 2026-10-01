import type { CatalogColor } from '../core/matcher'
import exemplo from './catalogo-exemplo.json'

export type Catalog = { id: string; label: string; colors: CatalogColor[] }

/**
 * Catálogos locais: qualquer `src/data/*.local.json` é carregado automaticamente.
 * Esses arquivos estão no .gitignore, então ficam fora do repositório e do deploy feito a partir do git.
 */
const locals = import.meta.glob<CatalogColor[]>('./*.local.json', { eager: true, import: 'default' })

function labelFor(path: string, colors: CatalogColor[]): string {
  return colors[0]?.marca || path.replace(/^\.\/(catalogo-)?|\.local\.json$/g, '')
}

export const CATALOGS: Catalog[] = [
  ...Object.entries(locals).map(([path, colors]) => ({ id: path, label: labelFor(path, colors), colors })),
  { id: 'exemplo', label: 'Exemplo', colors: exemplo },
]
