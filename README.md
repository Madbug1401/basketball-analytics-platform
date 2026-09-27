# Courtside — Basketball Analytics Platform

Gestão de equipa e análise de basquetebol. Primeira equipa: **ABC Sub-16 Masculino** (Cabo Verde), época 2026/27.

> "Courtside" é um nome provisório: muda-o em `src/components/Shell.tsx` e `src/app/layout.tsx`.

## Arrancar

```bash
npm install
npm run dev
# abre http://localhost:3000
```

Precisas do Node 20 ou mais recente.

- **Sem configuração** → "modo local": tudo fica no browser, sem login (como na v0.1).
- **Com Supabase** (`.env.local`, ver `.env.example`) → versão online: contas, papéis (admin, dono, treinador, analista, jogador), convites por código e sync na cloud.
  Guia completo para pôr online (Supabase + Vercel): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Dados de teste

`dados-teste/abc-sub16-demo.json` tem uma época fictícia do ABC Sub-16: 12 jogadores, cerca de 40 treinos com presenças, 10 jogos com todos os eventos (lançamentos com local, substituições, adversário, contexto das jogadas), 7 objetivos, agenda com os próximos jogos e treinos, convocatória, exercícios, scouting e mensagens de feedback. As datas são relativas ao dia em que o ficheiro foi gerado. No primeiro ecrã, carrega em **importar uma cópia (.json)**; se já tens uma equipa, usa Definições → Importar.

Para gerar outra variação: `node scripts/gerar-dados-teste.mjs dados-teste/outra.json 42 2026-10-15` (seed e "hoje").

## O que já faz (v0.5)

| Área | Funcionalidades |
|---|---|
| **Plantel** | Jogadores com nº, posição, ano, altura e notas; ativar/desativar; várias equipas |
| **Treinos** | Criar treino, presenças (presente / atrasado / falta / justificada), intensidade, exercícios, assiduidade da época |
| **Game Logger** | Vídeo do YouTube, MP4 local, link direto ou sem vídeo (cronómetro) · 5 inicial e substituições · atalhos de teclado · mapa de lançamentos (2/3 pontos detetado pela posição) · adversário · anular · "▶ ver jogada" em cada evento · contexto da jogada |
| **Ao vivo (banco)** | Registo no telemóvel durante o jogo, sem vídeo: relógio de jogo (minutos exatos), 5 em campo com pontos e faltas, aviso na 4.ª e 5.ª falta, bónus, descontos de tempo (FIBA), fim de período e prolongamento, ecrã sempre ligado |
| **Contexto das jogadas** | Etiquetas opcionais (transição, pick & roll, 1x1, poste, 2.ª oportunidade, sem bola, vs zona, vs pressão) · pontos por jogada em cada contexto, no jogo e na época · filtro e sequência de vídeo por contexto |
| **Objetivos** | Metas da equipa e de cada jogador (pontos, ressaltos, perdas, %LL, assiduidade, vitórias…) com progresso automático e tendência dos últimos 3 jogos · o jogador vê os seus |
| **Partilhar** | Imagem do jogo (1080×1350) com resultado, parciais, líderes e box score para WhatsApp/Instagram · resumo em texto |
| **Agenda** | Treinos e jogos com hora, concentração e local · convocatória (rascunho/publicada) · cada jogador responde "vou / talvez / não posso" com nota · resumo de quem vem · mensagem pronta para o WhatsApp · respostas visíveis na folha de presenças |
| **Feedback** | O treinador envia a um jogador uma nota com a jogada do vídeo (botão ➤ no registo) · o jogador vê a jogada no telemóvel (YouTube/link) e fica marcado como "visto" |
| **Planeador de treinos** | Biblioteca de exercícios (16 de base) · plano de cada treino com minutos · sugestões a partir dos jogos (perdas, lances livres, ressalto, pressão…) · tempo por área na época |
| **Scouting** | Notas e jogadores a vigiar por adversário · chaves do jogo automáticas · relatório pré-jogo em imagem/texto |
| **Quintetos** | Saldo por 100 posses de quintetos, duplas e trios · equipa com/sem cada jogador · gestão de minutos com alertas de carga |
| **Offline** | A app abre e funciona sem internet (service worker); tudo fica no telemóvel e sincroniza quando voltar a ligação |
| **Jogo** | Relatório automático (parciais decisivos, perdas, ressaltos, LL, quintetos, jogadores acima/abaixo da média) com "▶ ver jogadas" · parciais · box score com minutos estimados, +/-, eficiência · mapa de lançamentos · quintetos · imprimir em A4 |
| **Vídeo** | Editar qualquer evento (✎) · filtrar por jogador/tipo e **ver a sequência** das jogadas (ex.: todas as perdas do #7) · links do relatório abrem a sequência certa |
| **Adversários** | Registo contra cada equipa, onde lançam (mapa + zonas), médias por período, notas rápidas |
| **Época** | Médias/totais, pontos por jogo, vitórias vs derrotas, assiduidade × produção |
| **Jogador** | Perfil, evolução por jogo, mapa de lançamentos da época, jogo a jogo |
| **Contas e papéis** | Login por email · admin da plataforma · dono/treinador/analista/jogador por equipa · convites por código (WhatsApp) · o jogador vê os seus dados e os da equipa, sem notas do treinador |
| **Online** | Supabase (Postgres + RLS) · sync em segundo plano, funciona offline · página Admin · eliminar equipa (dono) · sair da equipa |
| **Dados** | Exportar/importar equipa em JSON |

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
- **Local-first**: IndexedDB via Dexie (`src/lib/db.ts`) é sempre a fonte imediata — a app funciona sem internet.
- **Sync** (`src/lib/sync.ts`): cada escrita local entra numa fila (`outbox`, via hooks do Dexie) e é enviada ao Supabase em lotes; o pull é incremental (`updated_at`) e as remoções chegam por `tombstones`.
- **Permissões no servidor** (`supabase/schema.sql`): Row Level Security por equipa; notas do treinador em tabelas à parte (`players_private`, `games_private`) que os jogadores não conseguem ler; convites e visão de admin por funções `security definer`.
- **Eventos como fonte da verdade** (`events`): estatísticas, +/-, minutos, quintetos e mapas são calculados (`src/lib/stats.ts`).

```
src/
  app/            páginas (painel, equipa, treinos, jogos, logger, adversarios, estatisticas, jogadores, definicoes, admin, convite, conta)
  components/     Shell (auth + navegação por papel), AuthScreen, InviteDialog, Court, VideoPlayer, EventLog, BoxScore, Trend
  lib/            db (Dexie + fila), sync, auth (sessão/papéis), members, teamAdmin, stats, insights, court, season
supabase/         schema.sql (tabelas, RLS, triggers, RPCs)
docs/             DEPLOY.md, ROADMAP.md
```

## Privacidade

São jogadores menores de idade. Guardamos só o ano de nascimento, nada de contactos. Pede autorização aos pais antes de partilhar dados fora da equipa técnica.
