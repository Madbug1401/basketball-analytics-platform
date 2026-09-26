# Courtside — Basketball Analytics Platform

Gestão de equipa e análise de basquetebol. Primeira equipa: **ABC Sub-16 Masculino** (Cabo Verde), época 2026/27.

> "Courtside" é um nome provisório: muda-o em `src/components/Shell.tsx` e `src/app/layout.tsx`.

## Arrancar

```bash
npm install
npm run dev
# abre http://localhost:3000
```

Precisas do Node 20 ou mais recente. Para usar no dia a dia sem o modo dev: `npm run build && npm start`.

## Dados de teste

`dados-teste/abc-sub16-demo.json` tem uma época fictícia do ABC Sub-16: 12 jogadores, cerca de 40 treinos com presenças e 10 jogos com todos os eventos (lançamentos com local, substituições, adversário). No primeiro ecrã, carrega em **importar uma cópia (.json)**; se já tens uma equipa, usa Definições → Importar.

Para gerar outra variação: `node scripts/gerar-dados-teste.mjs dados-teste/outra.json 42` (o último número é a seed).

## O que já faz (v0.2)

| Área | Funcionalidades |
|---|---|
| **Plantel** | Jogadores com nº, posição, ano, altura e notas; ativar/desativar; várias equipas |
| **Treinos** | Criar treino, presenças (presente / atrasado / falta / justificada), intensidade, exercícios, assiduidade da época |
| **Game Logger** | Vídeo do YouTube, MP4 local, link direto ou sem vídeo (cronómetro) · 5 inicial e substituições · atalhos de teclado · mapa de lançamentos (2/3 pontos detetado pela posição) · adversário · anular · "▶ ver jogada" em cada evento |
| **Jogo** | Relatório automático (parciais decisivos, perdas, ressaltos, LL, quintetos, jogadores acima/abaixo da média) com "▶ ver jogadas" · parciais · box score com minutos estimados, +/-, eficiência · mapa de lançamentos · quintetos · imprimir em A4 |
| **Vídeo** | Editar qualquer evento (✎) · filtrar por jogador/tipo e **ver a sequência** das jogadas (ex.: todas as perdas do #7) · links do relatório abrem a sequência certa |
| **Adversários** | Registo contra cada equipa, onde lançam (mapa + zonas), médias por período, notas rápidas |
| **Época** | Médias/totais, pontos por jogo, vitórias vs derrotas, assiduidade × produção |
| **Jogador** | Perfil, evolução por jogo, mapa de lançamentos da época, jogo a jogo |
| **Dados** | Exportar/importar tudo em JSON |

## Atalhos do logger

| Tecla | Ação |
|---|---|
| `1`–`5` | jogador em campo (ou assistência/ressalto logo após um lançamento) |
| `0` | adversário |
| `Q` `W` | 2PT convertido / falhado |
| `E` `R` | 3PT convertido / falhado |
| `T` `Y` | lance livre convertido / falhado |
| `O` `D` | ressalto ofensivo / defensivo |
| `A` `S` `B` `P` | assistência · roubo · desarme · perda de bola |
| `F` `G` | falta / falta sofrida |
| `U` | substituição (1–5 sai, nº + Enter entra) |
| clique no campo | local do lançamento → `Enter` convertido, `⌫` falhado |
| `Espaço` `←` `→` `,` `.` | play/pausa, ±5s (Shift ±1s), velocidade |
| `Ctrl+Z` · `Esc` | anular último · cancelar pendente |
| ✎ na lista | editar evento |

Fluxo típico: `2` → `Q` → `4` (assistência) → clique no campo. Lançamento falhado: `W` → `3` (ressalto).

## Arquitetura

- **Next.js 16 + React 19 + Tailwind 4**, tudo no cliente.
- **Local-first**: IndexedDB via Dexie (`src/lib/db.ts`). Funciona offline. Os dados ficam **no browser**, por isso **exporta cópias** em Definições.
- **Eventos como fonte da verdade** (`game_events`): estatísticas, +/-, quintetos e mapas de lançamento são calculados (`src/lib/stats.ts`). Corrigir um evento corrige tudo.
- Cada evento guarda `video_ts` (segundo do vídeo), `period`, `x/y` (metros FIBA) e quem estava em campo é reconstruído a partir de `PERIOD_START` + `SUB`.
- Multi-equipa: tudo tem `teamId`. O esquema Postgres/Supabase com RLS está em `supabase/schema.sql`.

```
src/
  app/            páginas (painel, equipa, treinos, jogos, logger, estatisticas, jogadores, definicoes)
  components/     Court (campo SVG), VideoPlayer (YouTube/HTML5/cronómetro), BoxScore, Trend, Shell
  lib/            types, db (Dexie), stats (motor de estatísticas), court (geometria FIBA), season
supabase/         schema.sql para a fase cloud
docs/ROADMAP.md   próximos passos
```

## Privacidade

São jogadores menores de idade. Guardamos só o ano de nascimento, nada de contactos. Pede autorização aos pais antes de partilhar dados fora da equipa técnica.
