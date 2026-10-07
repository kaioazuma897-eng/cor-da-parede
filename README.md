# Cor da Parede

Tire uma foto de uma parede ou objeto: o app extrai a cor e sugere as tintas mais próximas do catálogo,
medindo a diferença com **CIEDE2000 (ΔE00)** no espaço de cor **CIE L\*a\*b\***.

Tudo roda no navegador. A foto não sai do aparelho. Funciona como **app instalável (PWA)**, inclusive offline.

## Instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Pronto: o app abre em tela cheia pelo ícone e funciona sem internet.

### Usar a paleta oficial de uma marca

O site publicado traz só um catálogo de exemplo. Para usar as cores de um fabricante:

1. Baixe a paleta oficial para Photoshop no site da marca (ex.: a Suvinil oferece o `Adobe_Ps.zip` na página
   *Ferramentas Digitais*).
2. No app, toque em **Importar paleta** e escolha o `.zip` ou o `.ase`.
3. As cores ficam salvas **só no seu aparelho**: nada é enviado para servidor nenhum.

```bash
npm install
npm run dev     # app em http://localhost:5173
npm test        # testes do core
npm run build   # gera dist/ com o service worker do PWA
```

A cada `push` na branch `main`, o GitHub Actions ([`deploy.yml`](.github/workflows/deploy.yml)) roda lint,
testes e build, e publica no GitHub Pages.

## Como funciona

```
foto ─► pixels (Canvas, orientação EXIF corrigida, máx. 1600 px)
     ─► [opcional] calibração pela folha branca (von Kries / Bradford)
     ─► sRGB → linear → XYZ (D65) → L*a*b*
     ─► região marcada: mediana por canal  ─┐
     ─► foto inteira: k-means++ (paleta)   ─┴► cor alvo ─► ΔE00 contra o catálogo ─► top 5
                                                                                      │
          prévia: crescimento de região a partir do toque ─► repintura preservando sombras ◄┘
```

| Etapa | Arquivo | Por quê |
|---|---|---|
| Conversão de cor | [`src/core/color.ts`](src/core/color.ts) | Lab é aproximadamente uniforme para a percepção; RGB não é. |
| ΔE00 | [`src/core/deltaE.ts`](src/core/deltaE.ts) | Corrige as distorções do Lab (azuis, cores neutras, croma alto). Validado com os 34 pares de referência de Sharma, Wu & Dalal (2005). |
| Cor da região | [`src/core/image.ts`](src/core/image.ts) | A **mediana** ignora sombras e reflexos que a média absorveria. A dispersão da região gera um aviso quando a área mistura cores. |
| Paleta dominante | [`src/core/kmeans.ts`](src/core/kmeans.ts) | k-means em Lab, inicialização k-means++ e PRNG com semente (mesma foto → mesma paleta). |
| Calibração | [`src/core/whiteBalance.ts`](src/core/whiteBalance.ts) | Corrige cor da luz e exposição usando uma folha branca na foto (ver abaixo). |
| Paletas .ase / .zip | [`src/core/ase.ts`](src/core/ase.ts), [`src/core/zip.ts`](src/core/zip.ts) | Lê o formato binário Adobe Swatch Exchange e extrai de ZIP com `DecompressionStream`, sem bibliotecas. |
| Prévia na parede | [`src/core/segment.ts`](src/core/segment.ts), [`src/core/recolor.ts`](src/core/recolor.ts) | Segmenta a parede a partir do toque e repinta mantendo sombras e textura (ver abaixo). |
| Busca no catálogo | [`src/core/matcher.ts`](src/core/matcher.ts) | Exata por padrão; k-d tree opcional (ver abaixo). |

### Calibração com folha branca

A câmera registra a luz refletida, não a cor da tinta: a mesma parede sob lâmpada amarela ou luz de janela
pode variar ΔE 10 ou mais. Com uma folha de papel branca encostada na parede:

1. Mede-se a cor da folha (mediana em RGB linear, robusta a bordas e riscos).
2. Calcula-se a **adaptação cromática de von Kries no espaço de cones de Bradford** que leva essa cor a um
   branco neutro D65 com luminância de papel (Y = 0,88). Isso corrige ao mesmo tempo a cor da luz e a exposição.
3. A mesma matriz 3×3 (em RGB linear) é aplicada à foto inteira, com tabelas de conversão para não fazer
   milhões de `Math.pow`.

Erro em relação à cor real (ΔE00), em cenas sintéticas com 8 cores de parede:

| Luz simulada | Antes (média) | Depois (pior caso) |
|---|---|---|
| Lâmpada incandescente | 11,1 | 2,95 |
| Luz fria / dia nublado | 6,8 | 1,4 |
| Cômodo escuro | 21,3 | 1,0 |

O erro que sobra vem da diferença de modelo: a cena simula a luz multiplicando canais RGB, e a correção
atua no espaço LMS. Câmeras reais não seguem nenhum dos dois exatamente.

Proteções: o app avisa quando a folha está **estourada** (branco puro, sem informação de cor), **escura demais**
ou quando a área **mistura** folha e parede (fração de pixels a mais de ΔE76 12 da cor medida, já que a mediana
sozinha esconderia a mistura). E **recusa** calibrar quando a "folha" tem croma acima de 35, porque papel branco,
mesmo sob lâmpada incandescente, fica em torno de 25.

Limitações: papel comum tem branqueador óptico (puxa levemente para o azul) e a folha precisa receber a
mesma luz que a parede. Com iluminação mista, a correção deixa de ser exata.

### Prévia da cor na parede

**Segmentação** ([`segment.ts`](src/core/segment.ts)): a foto vira uma grade Lab de até 800 px de lado (média por
bloco em RGB linear + desfoque 3×3 contra ruído). A partir de cada toque, uma busca em largura cresce a região
aceitando um vizinho quando:

- ele tem o mesmo **tom** da referência (mediana 5×5 em volta do toque). A luminosidade pesa pouco (×0,35) e a* e b*
  são **normalizados pela luminosidade** (`× (L_ref+16)/(L+16)`): escurecer uma cor multiplica a*, b* e L*+16 pelo
  mesmo fator, então a mesma tinta na luz e na sombra fica com o mesmo valor. Um teste prova que, com tolerância
  baixa, a região atravessa uma parede que vai de 100% a 40% de luz *com* a normalização e falha *sem* ela;
- **não há borda** entre ele e o pixel de onde veio (mudança local brusca = rodapé, quadro, móvel).

Depois, um fechamento morfológico tapa buraquinhos e um desfoque suaviza a borda da máscara.

**Repintura** ([`recolor.ts`](src/core/recolor.ts)): cada pixel ≈ refletância da tinta × luz local. A razão entre a
luminância do pixel e a mediana da parede estima a luz local (1 na área típica, 0,5 na sombra, >1 num reflexo), e
a cor nova é a tinta escolhida em RGB linear multiplicada por essa razão. Sombras, textura e brilhos continuam lá.

**Várias paredes:** cada parede é uma camada com seus toques, seu alcance e sua cor
([`scene.ts`](src/core/scene.ts)). A luz local é estimada sempre na foto original, então uma camada não altera o
sombreamento da outra; onde duas se sobrepõem, a última fica por cima. As máscaras ficam em cache por toques + alcance:
trocar a cor de uma parede repinta sem segmentar de novo.

**Web Worker:** segmentação e repintura rodam em [`paint.worker.ts`](src/lib/paint.worker.ts). Numa foto de
1600 px, cada mudança custa ~100 ms de segmentação + ~100 ms de repintura (mais ~120 ms para montar a grade Lab
no primeiro toque) num computador, e várias vezes isso num celular. Fora da thread principal, a tela não trava.
O [`usePainter`](src/lib/usePainter.ts) mantém só um pedido em andamento: enquanto o worker trabalha, pedidos novos
(arrastando o alcance, por exemplo) substituem o pendente, e só o mais recente é calculado.

**Como fica sob outra luz** ([`lighting.ts`](src/core/lighting.ts)): é o caminho inverso da calibração. A foto
representa as cores sob branco neutro D65; para simular uma lâmpada de T kelvin, calcula-se o branco dela no lugar
geométrico de Planck (aproximação cúbica de Kim et al., 2002) e aplica-se a adaptação de Bradford D65 → lâmpada,
preservando a luminância do branco. O olho se adapta em boa parte à cor da luz (um papel branco sob lâmpada amarela
continua parecendo quase branco depois de alguns minutos), então a simulação mostra **metade** do desvio de uma câmera
com balanço fixo. Resultado na foto de exemplo calibrada:

| | Luz do dia | Lâmpada neutra (4000 K) | Lâmpada amarela (2700 K) |
|---|---|---|---|
| Folha branca | `#F2F1F1` | `#FFEDD4` | `#FFE5B9` |
| Parede Azul Sereno | `#7D9AB4` | `#8E979F` | `#A1938B` |

Sem calibração, a simulação parte do princípio de que o balanço de branco automático da câmera deixou a foto neutra.
Se a foto já foi tirada sob luz amarela, o efeito soma ao que já existe, e o app avisa para calibrar com a folha.

**Harmonias** ([`harmony.ts`](src/core/harmony.ts)): a partir da tinta da parede 1 (ou da mais próxima da cor
medida), o matiz é girado em **LCh**, e não no círculo RGB, para que "oposto" seja oposto na percepção:
tom sobre tom (L* ± 14), análogas (±30°), complementar (180°) e tríade (±120°). Cada cor ideal vira a tinta real
mais próxima do catálogo, sem repetir tintas. Se nenhuma tinta fica a menos de ΔE00 18 da cor ideal, tenta-se a
mesma cor com 75% e 50% do croma (tinta de parede raramente é tão viva quanto a complementar de uma cor saturada)
e, se mesmo assim não houver, a harmonia não aparece: melhor não sugerir do que sugerir uma cor que não combina.
Cores neutras (croma < 8) recebem só tom sobre tom, porque o matiz delas não significa nada.

**Escolher a cor e compartilhar:** qualquer tinta do catálogo pode ir para a parede, não só as mais próximas
da cor medida. O seletor ordena o catálogo como um mostruário (neutros primeiro, depois por faixa de matiz em LCh)
e busca por nome ou código ignorando acentos ([`catalogSearch.ts`](src/core/catalogSearch.ts)). O resultado pode ser
compartilhado pelo menu nativo do celular (Web Share) ou baixado como JPG, com uma faixa embaixo identificando a
tinta (nome, marca, código) para quem recebe a foto saber o que pedir na loja ([`exportImage.ts`](src/lib/exportImage.ts)).

Limitação: reflexos fortes "lavam" a cor (somam branco) e não são invariantes a esse modelo; o usuário inclui
tocando neles ou aumentando o alcance.

### Por que a busca padrão não usa a k-d tree

A ideia óbvia é indexar o catálogo numa k-d tree em Lab e reordenar os vizinhos por ΔE00.
O problema é que **ΔE00 não é uma métrica**: ele viola a desigualdade triangular, e os vizinhos por distância euclidiana
(ΔE76) não são necessariamente os vizinhos por ΔE00, principalmente em cores saturadas, onde o ΔE00 "encolhe"
as diferenças de croma.

Medição com 1 500 cores aleatórias e 3 000 consultas dentro do gamut sRGB:

| Candidatos da k-d tree | Top 5 diferente da busca exata |
|---|---|
| 40 | ~4% |
| 50 | ~1,7% |
| 100 | ~0,2% |

E o custo da busca exata (média por consulta):

| Cores no catálogo | Exata (O(n)) | k-d tree + 100 candidatos |
|---|---|---|
| 300 | 0,13 ms | 0,06 ms |
| 2 000 | 0,88 ms | 0,06 ms |
| 10 000 | 4,8 ms | 0,09 ms |

Um catálogo de tinta tem poucos milhares de cores, então a busca **exata** custa menos de 1 ms e é o padrão.
A k-d tree ([`src/core/kdtree.ts`](src/core/kdtree.ts)) continua disponível (`{ strategy: 'kdtree' }`) para consultas
em massa, e os testes garantem que ela acerta o top 5 em pelo menos 99% dos casos.

## Catálogo

O formato é um JSON simples em [`src/data/`](src/data/):

```json
[{ "marca": "Exemplo", "codigo": "EX-024", "nome": "Terracota", "hex": "#B8603E" }]
```

### Catálogos públicos x locais

- **Públicos** (vão para o git e para o deploy): registrados em [`src/data/catalogs.ts`](src/data/catalogs.ts).
- **Locais** (uso pessoal, ex.: cores anotadas de uma marca comercial): qualquer arquivo `src/data/*.local.json`
  é carregado automaticamente, aparece no seletor de catálogo e **está no `.gitignore`**.
  Use [`catalogo-suvinil.local.example.json`](src/data/catalogo-suvinil.local.example.json) como modelo:
  copie para `catalogo-suvinil.local.json` e preencha.

### Importando paletas oficiais (.ase)

Muitos fabricantes distribuem paletas no formato Adobe Swatch Exchange para designers. O leitor em
[`src/core/ase.ts`](src/core/ase.ts) entende o formato binário (big-endian, nomes UTF-16, cores RGB, Lab, CMYK
ou cinza, grupos) e o script converte para o formato do app:

```bash
node scripts/ase-to-catalog.ts <arquivo.ase> <Marca> src/data/catalogo-<marca>.local.json
```

O script separa "CÓDIGO - Nome", remove cópias idênticas e, quando o mesmo código aparece com cores
diferentes no arquivo original, mantém todas as versões numeradas (`RM003 (2)`) em vez de escolher uma.
Respeite os termos de uso de cada fabricante: em geral, só uso pessoal (por isso o `.local.json`).

`npm test` valida todos os catálogos, inclusive os locais (hex, campos obrigatórios e códigos repetidos).

> Atenção: um `npm run build` feito na sua máquina inclui os catálogos locais no `dist/`.
> Para publicar, faça o deploy a partir do git (Vercel, Netlify, GitHub Actions), onde esses arquivos não existem.

> Projeto de estudo, sem vínculo com fabricantes de tinta. Nomes e códigos de cores pertencem às respectivas marcas.
> Cores em tela são aproximações: confira sempre com a amostra física.

## Próximos passos

- [x] Calibração de balanço de branco com uma folha A4 na foto
- [x] Prévia em Web Worker (fotos grandes sem travar a tela)
- [x] Harmonias de cor (complementar, análoga, tríade) a partir da cor escolhida
- [x] Prévia da cor aplicada na parede
- [x] PWA (instalar no celular, funcionar offline)
- [x] Importar paletas oficiais (.ase/.zip) direto no app
- [x] Escolher qualquer cor do catálogo para a prévia, com busca
- [x] Compartilhar/baixar a foto com a cor aplicada
- [x] Várias paredes com cores diferentes na mesma foto
- [x] Simular a cor sob lâmpada amarela e neutra
