# Pôr o Courtside online (Supabase + Vercel)

Tempo estimado: 20–30 minutos. Tudo nos planos gratuitos.

## 1. Supabase (base de dados + login)

1. Cria conta em <https://supabase.com> e um **New project**.
   - Nome: `courtside`. Região: **West EU (Ireland)** (a mais próxima de Cabo Verde).
   - Guarda a password da base de dados num sítio seguro.
2. **SQL Editor → New query**: cola todo o conteúdo de `supabase/schema.sql` e carrega em **Run**.
   Deve terminar sem erros. (Podes correr outra vez no futuro: o ficheiro é seguro de repetir.)
3. **Authentication → Sign In / Providers → Email**:
   - **Desliga "Confirm email"** para começar. O servidor de email grátis do Supabase só envia emails para membros da tua organização Supabase, por isso os jogadores não receberiam o email de confirmação.
   - Mais tarde, se quiseres confirmação por email e recuperação de password, configura um SMTP próprio em **Authentication → Emails → SMTP** (ex.: Resend, grátis até 3000 emails/mês).
4. **Project Settings → API** (ou botão **Connect**): copia
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Nunca uses a `service_role` / secret key na app.)

## 2. Testar no teu computador

```bash
cp .env.example .env.local   # e cola os dois valores
npm install
npm run dev
```

Abre <http://localhost:3000>, cria a tua conta e a equipa.

## 3. Tornar-te administrador

Depois de criares a tua conta na app, no **SQL Editor** do Supabase:

```sql
update public.profiles set is_admin = true where email = 'nicolaisantos22@gmail.com';
```

Recarrega a app: aparece o separador **Admin** no topo. A partir daí podes dar/tirar admin a outras pessoas pela própria app.

## 4. GitHub

```bash
git remote add origin https://github.com/<o-teu-utilizador>/courtside.git
git push -u origin main
```

(O repositório pode ser privado.)

## 5. Vercel (alojamento da app)

1. Entra em <https://vercel.com> com a conta do GitHub → **Add New → Project** → escolhe o repositório.
2. Em **Environment Variables** adiciona as duas variáveis do passo 1.4.
3. **Deploy**. Fica com um endereço tipo `https://courtside-xxxx.vercel.app`.
4. De volta ao Supabase → **Authentication → URL Configuration**:
   - **Site URL**: o endereço da Vercel.
   - **Redirect URLs**: `https://courtside-xxxx.vercel.app/**` e `http://localhost:3000/**`.

Cada `git push` para `main` faz um novo deploy automático.

## 6. Passar os dados que já tens

Os dados da versão local ficam no browser, num endereço diferente (localhost). Para os levar:

1. Na versão local: **Definições → Exportar equipa (.json)**.
2. Na versão online, com sessão iniciada: **Definições → Importar…** (ou no primeiro ecrã, "importar uma cópia").
   A equipa é enviada para a tua conta e ficas como dono.

## Papéis

| Papel | O que pode fazer |
|---|---|
| **Admin** (tu) | Tudo, em todas as equipas. Página Admin com utilizadores e equipas. |
| **Dono / treinador principal** | Tudo na sua equipa: registar, editar, convidar treinadores/analistas/jogadores, gerir membros, **eliminar a equipa**. |
| **Treinador / Analista** | Registar jogos, treinos, presenças, editar plantel, convidar jogadores. Não elimina a equipa nem gere membros. |
| **Jogador** | Vê os seus dados (evolução, lançamentos, presenças) e os da equipa (jogos, box scores, estatísticas). Não vê notas do treinador nem as presenças dos colegas. Não edita nada. |

**Convidar um jogador:** Plantel → botão **Convidar** ao lado do jogador → envia o código/link por WhatsApp. O jogador cria conta e fica ligado à sua ficha.
**Convidar o Melvyn como treinador:** Definições → Membros → **+ Convidar treinador**.

## Como funciona o sync

A app continua a guardar tudo primeiro no dispositivo (funciona sem internet no pavilhão) e envia para o Supabase em segundo plano. O ponto no topo mostra o estado: verde = tudo na cloud, azul = a enviar, laranja = offline (fica guardado e envia quando voltar a ligação).

## Atualizações da base de dados

Quando uma versão nova traz tabelas novas, há um ficheiro em `supabase/migrations/`. Corre-o uma vez no **SQL Editor** (pode correr-se mais do que uma vez sem estragar nada). Enquanto não correres, a app continua a funcionar: as alterações dessas tabelas ficam guardadas no dispositivo e são enviadas depois.

| Ficheiro | O que traz |
|---|---|
| `2026-09-26-objetivos.sql` | Tabela `goals` (Objetivos) com permissões: staff gere, o jogador vê os da equipa e os seus |
| `2026-09-27-v05.sql` | Agenda/convocatórias (`agenda`, `rsvps`), feedback (`feedback`, `seen`), exercícios (`drills`) e scouting (`scouting`). O jogador só escreve as suas respostas e o "visto" |

Uma instalação nova só precisa do `schema.sql` (já inclui tudo).
