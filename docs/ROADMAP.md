# Roadmap

## Agora: validar com o ABC (antes do 1.º jogo oficial)
- [ ] Meter o plantel real do ABC Sub-16
- [ ] Registar um jogo antigo em vídeo com o Melvyn e cronometrar (vs o método dele)
- [ ] Lista de "o que foi irritante / o que faltou" depois de cada jogo e treino

## Fase 1.5: detalhes que vão aparecer no uso real
- [x] Editar evento (jogador, tipo, resultado, tempo, período) — v0.2
- [x] Minutos jogados *estimados* pelo tempo de vídeo — v0.2 (precisão ±1–2 min)
- [ ] Minutos exatos (marcar o relógio de jogo nas paragens) — só se a estimativa não chegar
- [x] Faltas por período com aviso de bónus — v0.2
- [x] Imprimir/PDF do box score (A4 horizontal) — v0.2
- [x] Relatório automático pós-jogo com links para as jogadas — v0.2
- [x] Sequência de clips: filtrar eventos e ver as jogadas seguidas — v0.2
- [x] Instalável como app (manifest + ícones) — v0.2
- [ ] Funcionar offline no pavilhão (service worker)

## Fase 2: cloud e multi-treinador
- [x] Supabase: login, `supabase/schema.sql`, sync local-first (v0.3)
- [x] Papéis: admin, dono, treinador, analista, jogador + convites por código (v0.3)
- [x] Página de admin; eliminar equipa; sair da equipa (v0.3)
- [ ] Pôr online (Supabase + Vercel) — ver docs/DEPLOY.md
- [ ] Emails próprios (SMTP) para confirmação e recuperação de password
- [ ] Contexto das jogadas (contra-ataque, pick & roll, isolamento…) como etiquetas nos eventos
- [ ] Análise do adversário: mapa de lançamentos e tendências por equipa adversária

## Fase 3: vídeo
- [x] Clips/playlist: "todos os turnovers do #7" → sequência de jogadas (v0.2)
- [ ] Marcadores e notas no vídeo
- [ ] Partilhar um clip com um jogador

## Fase 4: intelligence
- [x] Relatório automático pós-jogo (regras simples, v0.2)
- [ ] Assistente da época (perguntas em linguagem natural sobre os dados)
