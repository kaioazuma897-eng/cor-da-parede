/**
 * Converte uma paleta .ase oficial de um fabricante em catálogo do app.
 *
 *   node scripts/ase-to-catalog.ts <arquivo.ase> <marca> <saída.json>
 *
 * Exemplo (uso pessoal; arquivos *.local.json ficam fora do git):
 *   node scripts/ase-to-catalog.ts SUVINIL_Leque_de_Cores.ase Suvinil src/data/catalogo-suvinil.local.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { aseToCatalog, dedupeByCode, parseAse } from '../src/core/ase.ts'

const [input, marca, output] = process.argv.slice(2)
if (!input || !marca || !output) {
  console.error('Uso: node scripts/ase-to-catalog.ts <arquivo.ase> <marca> <saída.json>')
  process.exit(1)
}

const file = readFileSync(input)
const colors = parseAse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
const { catalog, removed, conflicts } = dedupeByCode(aseToCatalog(colors, marca))

writeFileSync(output, '[\n' + catalog.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]\n')
console.log(`${catalog.length} cores gravadas em ${output}`)
const models = [...new Set(colors.map((c) => c.model))].join(', ')
console.log(`Modelos de cor no arquivo: ${models}`)
if (removed) console.log(`${removed} cópias idênticas removidas`)
if (conflicts.length) {
  console.warn(`Atenção: ${conflicts.length} códigos com cores diferentes no arquivo original: ${conflicts.join(', ')}`)
  console.warn('Todas as versões foram mantidas, numeradas (ex.: "CÓDIGO (2)"). Confira no leque físico.')
}
