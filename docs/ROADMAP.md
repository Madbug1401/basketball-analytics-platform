# Roadmap

## Agora: validar com o ABC (antes do 1.º jogo oficial)
- [x] Notificações push ativas em produção (chave VAPID na Vercel, 27 set)
- [ ] Testar as notificações no telemóvel (convocatória de teste)
- [ ] Meter o plantel real do ABC Sub-16
- [ ] Registar um jogo antigo em vídeo com o Melvyn e cronometrar (vs o método dele)
- [ ] Lista de "o que foi irritante / o que faltou" depois de cada jogo e treino

## Fase 1.5: detalhes que vão aparecer no uso real
- [x] Editar evento (jogador, tipo, resultado, tempo, período) — v0.2
- [x] Minutos jogados *estimados* pelo tempo de vídeo — v0.2 (precisão ±1–2 min)
- [x] Minutos exatos — no modo ao vivo (v0.4); no vídeo continuam estimados
- [x] Faltas por período com aviso de bónus — v0.2
- [x] Imprimir/PDF do box score (A4 horizontal) — v0.2
- [x] Relatório automático pós-jogo com links para as jogadas — v0.2
- [x] Sequência de clips: filtrar eventos e ver as jogadas seguidas — v0.2
- [x] Instalável como app (manifest + ícones) — v0.2
- [x] Funcionar offline no pavilhão (service worker) — v0.4
- [x] Modo ao vivo no banco: relógio de jogo, faltas, descontos, minutos exatos — v0.4
- [x] Imagem do jogo para partilhar no WhatsApp — v0.4
- [x] Objetivos individuais e da equipa com progresso automático — v0.4

## Fase 2: cloud e multi-treinador
- [x] Supabase: login, `supabase/schema.sql`, sync local-first (v0.3)
- [x] Papéis: admin, dono, treinador, analista, jogador + convites por código (v0.3)
- [x] Página de admin; eliminar equipa; sair da equipa (v0.3)
- [x] Pôr online (Supabase + Vercel) — ver docs/DEPLOY.md
- [ ] Emails próprios (SMTP) para confirmação e recuperação de password
- [x] Contexto das jogadas (contra-ataque, pick & roll, isolamento…) como etiquetas nos eventos — v0.4
- [x] Análise do adversário: mapa de lançamentos, tendências e relatório pré-jogo (v0.5)

## v0.5
- [x] Agenda e convocatórias com respostas dos jogadores
- [x] Feedback e jogadas enviadas a cada jogador
- [x] Planeador de treinos e biblioteca de exercícios
- [x] Relatório de scouting pré-jogo
- [x] Quintetos avançados (por 100 posses, com/sem, duplas/trios) e gestão de minutos
- [x] Notificações no telemóvel (push) para convocatórias e mensagens (v0.7)

## v0.6 — Basketball Intelligence (base)
- [x] Motor de posses (derivado dos eventos) e métricas por posse
- [x] "O que rever": momentos críticos com vídeo
- [x] Game plan com verificação automática
- [x] Notas do treinador ligadas ao vídeo
- [x] Timeline visual do jogo
- [x] Qualidade de lançamento (v0.7)
- [x] Planeador de rotações (v0.7)
- [ ] Assistente de IA sobre os dados

## v0.7 — Treinar e comunicar melhor
- [x] Qualidade de lançamento: zonas, pontos por lançamento vs esperado, seleção e acerto por jogador, mapa de zonas; local opcional no modo ao vivo
- [x] Notificações push: convocatória publicada, mensagens/relatórios, game plan, "não posso ir" e indisponibilidade (para a equipa técnica)
- [x] Planeador de rotações: minutos por período, tempo igual ou pela época, alertas no modo ao vivo, planeado vs real
- [x] Relatório individual pós-jogo (números vs média, 2 jogadas, objetivo) enviado a todos de uma vez
- [x] Carga de treino (esforço 1–10 × minutos, rácio 7 dias / 4 semanas) e disponibilidade na convocatória

## v0.8 — Perfil físico (proposta do Meny)
- [x] Medições com data (nunca se sobrescreve): antropometria + 4 testes de campo
- [x] Protocolo: 3 tentativas registadas, melhor automática, checklist (avaliador, aquecimento); fora do protocolo não conta como ponto de partida
- [x] Velocidade de crescimento (cm/ano) e alerta de pico de crescimento; envergadura − altura
- [x] Peso só visível para a equipa técnica
- [x] Subir de escalão: novo atleta ligado ao anterior, histórico físico copiado
- [ ] Comparação com valores de referência por idade · relatório físico em PDF

## v0.9 — Apagar jogo e revisão completa
- [x] Apagar jogo na lista de jogos e no topo do jogo, com confirmação do que se perde (pedido do Melvyn)
- [x] O que foi apagado não volta (trigger `skip_deleted` no servidor)
- [x] Sincronização: uma linha recusada já não leva o resto do lote; pull com sobreposição de 5 s
- [x] Registo: um jogador já não anula eventos com Ctrl+Z; ficheiro MP4 aberto por um jogador fica só no dispositivo dele
- [x] Ao vivo: faltas de equipa no prolongamento contam como o 4.º período (FIBA); anular "terminar período" devolve o relógio
- [x] Notificações: terminar sessão liberta o telemóvel; nova chave VAPID → volta a subscrever sozinho
- [x] Acesso offline guardado sempre que muda (equipa criada ou convite aceite)

## v0.10 — Idiomas
- [x] Toda a interface em português, inglês e francês (Definições → Idioma, menu da conta, ecrã de entrada)
- [x] Datas no formato da língua; notificações e textos gerados (relatórios, "o que rever", game plan) na língua de quem os cria
- [x] Verificação automática das traduções (`scripts/i18n-check.ts`) e teste que percorre todas as páginas em EN e FR
- [x] Atlas e apresentação à direção também em PT · EN · FR
- [ ] Traduzir os 16 exercícios base (hoje são criados em português, como dados da equipa)

## Fase 3: vídeo
- [x] Clips/playlist: "todos os turnovers do #7" → sequência de jogadas (v0.2)
- [x] Marcadores e notas no vídeo (v0.6)
- [x] Partilhar um clip com um jogador (v0.5, vídeos do YouTube ou link)

## Fase 4: intelligence
- [x] Relatório automático pós-jogo (regras simples, v0.2)
- [ ] Assistente da época (perguntas em linguagem natural sobre os dados)

## v0.11 — Feedback do ABC (29 set 2026) — detalhes em [docs/FEEDBACK-2026-09-29.md](FEEDBACK-2026-09-29.md)
- [x] PC vs telemóvel: menu do PC com "Mais ▾" (antes cortava itens sem aviso), versão e estado da sincronização visíveis, aviso de versão nova, aviso de migração em falta + "Reenviar os dados desta equipa"
- [x] Várias posições por atleta (principal + secundárias)
- [x] Menu ⋯ com Editar / Eliminar nas listas de Agenda, Jogos e Treinos; confirmação do treino diz o que se perde
- [x] Anexos nos exercícios: foto, vídeo curto (Supabase Storage), YouTube ou link
- [x] Acompanhar o plano durante o treino: estados, notas, cronómetro com pausas, corrigir horas, previsto vs real
- [ ] Pré-visualizar/limpar ficheiros órfãos no Storage (anexo removido sem internet)
- [ ] Comparar previsto vs real ao longo da época (tempo real por área, exercícios mais saltados)
