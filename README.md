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

## O que já faz (v0.11)

| Área | Funcionalidades |
|---|---|
| **Idiomas** | Toda a aplicação em **português, inglês ou francês**: escolhe-se em Definições → Idioma, no menu da conta ou no ecrã de entrada, e fica guardado no dispositivo · datas no formato da língua · os dados (nomes, notas, mensagens) ficam como foram escritos · como traduzir: [docs/I18N.md](docs/I18N.md) |
| **Plantel** | Jogadores com nº, posição principal **e posições secundárias** ("também joga como", editáveis ao longo da época), ano, altura e notas; ativar/desativar; várias equipas |
| **Treinos** | Criar treino, presenças (presente / atrasado / falta / justificada), intensidade, exercícios, assiduidade da época · menu ⋯ em cada treino (editar, acompanhar, eliminar com confirmação do que se perde) |
| **Treino ao vivo** | Abrir o plano durante o treino e marcar cada exercício: iniciar, pausa/retomar (tempo efetivo), concluir, não realizado (motivo opcional), nota por exercício e nota geral · corrigir horas marcadas por engano · previsto vs real no fim · funciona sem internet e mantém o ecrã ligado |
| **Game Logger** | Vídeo do YouTube, MP4 local, link direto ou sem vídeo (cronómetro) · 5 inicial e substituições · atalhos de teclado · mapa de lançamentos (2/3 pontos detetado pela posição) · adversário · anular · "▶ ver jogada" em cada evento · contexto da jogada |
| **Ao vivo (banco)** | Registo no telemóvel durante o jogo, sem vídeo: relógio de jogo (minutos exatos), 5 em campo com pontos e faltas, aviso na 4.ª e 5.ª falta, bónus (no prolongamento as faltas de equipa continuam as do 4.º período, regra FIBA), descontos de tempo (FIBA), fim de período e prolongamento, anular (também o "terminar período", que devolve o relógio), ecrã sempre ligado |
| **Contexto das jogadas** | Etiquetas opcionais (transição, pick & roll, 1x1, poste, 2.ª oportunidade, sem bola, vs zona, vs pressão) · pontos por jogada em cada contexto, no jogo e na época · filtro e sequência de vídeo por contexto |
| **Objetivos** | Metas da equipa e de cada jogador (pontos, ressaltos, perdas, %LL, assiduidade, vitórias…) com progresso automático e tendência dos últimos 3 jogos · o jogador vê os seus |
| **Partilhar** | Imagem do jogo (1080×1350) com resultado, parciais, líderes e box score para WhatsApp/Instagram · resumo em texto |
| **Agenda** | Treinos e jogos com hora, concentração e local · convocatória (rascunho/publicada) · cada jogador responde "vou / talvez / não posso" com nota · resumo de quem vem · mensagem pronta para o WhatsApp · respostas visíveis na folha de presenças |
| **Feedback** | O treinador envia a um jogador uma nota com a jogada do vídeo (botão ➤ no registo) · o jogador vê a jogada no telemóvel (YouTube/link) e fica marcado como "visto" |
| **Planeador de treinos** | Biblioteca de exercícios (16 de base) com **anexos: fotos, vídeos curtos, YouTube ou links** · plano de cada treino com minutos · sugestões a partir dos jogos (perdas, lances livres, ressalto, pressão…) · tempo por área na época |
| **Scouting** | Notas e jogadores a vigiar por adversário · chaves do jogo automáticas · relatório pré-jogo em imagem/texto |
| **Quintetos** | Saldo por 100 posses de quintetos, duplas e trios · equipa com/sem cada jogador · gestão de minutos com alertas de carga |
| **Posses** | Os eventos agrupados em posses (sem registar nada a mais): pontos por posse, eFG%, % perdas, % ressalto ofensivo, lances livres por lançamento, transição vs ataque organizado, 2.ª oportunidade · quintetos com posses reais (ataque/defesa por 100) |
| **O que rever** | Os momentos críticos de cada jogo (sequências de perdas, parciais, secas, 2.ª oportunidade cedida, quintetos que afundaram) com o bocado de vídeo certo |
| **Game plan** | Objetivos do jogo (a partir do scouting) verificados automaticamente depois do jogo ✅ ⚠️ ❌ · partilha no WhatsApp |
| **Notas de vídeo** | Notas do treinador num momento do vídeo (tecla N), só para a equipa técnica · aparecem na timeline e podem ser enviadas a um jogador |
| **Timeline** | Diferença no marcador ao longo do jogo e uma linha por período com cestos, perdas, substituições, notas e momentos a rever |
| **Qualidade de lançamento** | Zonas (cesto, garrafão, meia distância, triplo canto/frontal) · pontos por lançamento vs esperado (média da época) · seleção e acerto por jogador · mapa de zonas quentes/frias · nós e adversário · local do lançamento opcional no modo ao vivo |
| **Notificações** | Push no telemóvel: convocatória publicada, mensagens e relatórios do treinador, game plan · para a equipa técnica: "não posso ir" e jogador indisponível · funcionam também quando o treinador está offline (enviam quando voltar a rede) · ao terminar sessão o telemóvel deixa de receber as da conta anterior · se a chave do servidor mudar, o telemóvel volta a subscrever sozinho |
| **Rotações** | Minutos planeados por jogador e período (tempo igual ou pela época) · no modo ao vivo: minutos em campo, avisos de "passou do previsto", muito tempo seguido, faltas cedo e quem ainda tem minutos por jogar · planeado vs real no fim |
| **Relatório individual** | Depois do jogo, um relatório por jogador (números com ▲▼ vs a sua média, jogada para repetir e para melhorar em vídeo, objetivo, tendência) enviado a todos de uma vez |
| **Perfil físico** | Histórico datado de altura, peso (só staff), envergadura, alcance, salto parado, salto com balanço, lane agility e sprint ¾ · sessão de testes por estação com 3 tentativas (conta a melhor; o salto é calculado a partir do alcance) · checklist de protocolo (fora do protocolo fica marcado) · evolução, velocidade de crescimento (pico de crescimento) e envergadura − altura · "Subir de escalão" leva o histórico físico para a nova equipa |
| **Carga** | Cada jogador diz o esforço (1–10) depois do treino/jogo e se está disponível/condicionado/indisponível · carga dos últimos 7 dias vs média de 4 semanas com alertas · disponibilidade na convocatória · o treinador pode registar por quem não tem telemóvel |
| **Offline** | A app abre e funciona sem internet (service worker); tudo fica no telemóvel e sincroniza quando voltar a ligação |
| **Ações nas listas** | Menu ⋯ em cada linha de Agenda, Jogos e Treinos (editar / eliminar sem abrir o registo, também no telemóvel) · a confirmação diz o que se perde |
| **Versão e sincronização** | Definições → "Versão e sincronização" e o menu da conta mostram a versão, o endereço, o papel e o estado da sincronização (para comparar telemóvel e PC) · aviso "há uma versão nova" · aviso quando falta correr uma migração no servidor · menu do PC com "Mais ▾" (nada fica escondido) |
| **Apagar jogo** | Botão 🗑 em cada jogo da lista e no topo da página do jogo (só equipa técnica) · a confirmação diz o que se perde (eventos, notas de vídeo, game plan, rotação, convocatória e esforço desse jogo) · as mensagens já enviadas aos jogadores ficam, sem ligação ao jogo · o apagão chega a todos os dispositivos e não volta |
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
| `Ctrl+Z` · `Esc` | anular último (só equipa técnica) · cancelar pendente |
| ✎ na lista | editar evento |

Fluxo típico: `2` → `Q` → `4` (assistência) → clique no campo. Lançamento falhado: `W` → `3` (ressalto).

## Arquitetura

- **Next.js 16 + React 19 + Tailwind 4**, tudo no cliente.
- **Local-first**: IndexedDB via Dexie (`src/lib/db.ts`) é sempre a fonte imediata — a app funciona sem internet.
- **Sync** (`src/lib/sync.ts`): cada escrita local entra numa fila (`outbox`, via hooks do Dexie) e é enviada ao Supabase em lotes; se um lote é recusado, as linhas são reenviadas uma a uma e só as recusadas ficam de fora. O pull é incremental (`updated_at`, com 5 s de sobreposição) e as remoções chegam por `tombstones`; um trigger (`skip_deleted`) impede que um dispositivo atrasado recrie um jogo, treino, atleta ou evento já apagado.
- **Permissões no servidor** (`supabase/schema.sql`): Row Level Security por equipa; notas do treinador em tabelas à parte (`players_private`, `games_private`) que os jogadores não conseguem ler; convites e visão de admin por funções `security definer`.
- **Eventos como fonte da verdade** (`events`): estatísticas, +/-, minutos, quintetos e mapas são calculados (`src/lib/stats.ts`).

```
src/
  app/            páginas (painel, equipa, treinos, jogos, logger, adversarios, estatisticas, jogadores, definicoes, admin, convite, conta)
  components/     Shell (auth + navegação por papel), AuthScreen, InviteDialog, Court, VideoPlayer, EventLog, BoxScore, Trend, DeleteGame, ShotQuality, RotationPlanner, PlayerReport, Physical…
  lib/            db (Dexie + fila), sync, auth (sessão/papéis), members, teamAdmin, stats, insights, court, season, possessions, shotQuality, rotation, report, load, physical, push
supabase/         schema.sql (tabelas, RLS, triggers, RPCs) · migrations/ (uma por versão)
src/app/api/push/ única rota de servidor (envio das notificações)
docs/             DEPLOY.md, ROADMAP.md, I18N.md (traduções)
src/i18n/         dicionários en/fr por área (a chave é o texto em português) · src/lib/i18n.ts (t(), língua atual)
```

## Privacidade

São jogadores menores de idade. Guardamos só o ano de nascimento, nada de contactos. Pede autorização aos pais antes de partilhar dados fora da equipa técnica.
