import type { Catalog } from '../data/catalogs'

/**
 * Paletas importadas ficam só no aparelho (localStorage). Elas nunca vão para o
 * servidor nem para o repositório: é o usuário que traz o arquivo da marca.
 *
 * O acesso pode falhar (navegação privada, armazenamento cheio ou bloqueado), então
 * toda leitura e escrita é protegida e o app continua funcionando sem persistência.
 */
const CATALOGS_KEY = 'cor-da-parede:catalogos:v1'
const SELECTED_KEY = 'cor-da-parede:catalogo-selecionado'

export function loadImportedCatalogs(): Catalog[] {
  try {
    const raw = localStorage.getItem(CATALOGS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Catalog[]) : []
  } catch {
    return []
  }
}

/** Retorna false se não deu para salvar (o catálogo continua disponível até fechar o app). */
export function saveImportedCatalogs(catalogs: Catalog[]): boolean {
  try {
    localStorage.setItem(CATALOGS_KEY, JSON.stringify(catalogs))
    return true
  } catch {
    return false
  }
}

export function loadSelectedCatalog(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

export function saveSelectedCatalog(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id)
  } catch {
    // preferência opcional
  }
}
