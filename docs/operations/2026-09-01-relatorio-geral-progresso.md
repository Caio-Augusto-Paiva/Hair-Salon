# Relatório geral de progresso — Proveras

**Data:** 1º de setembro de 2026
**Branch de desenvolvimento:** `codex/proveras-platform`
**Worktree:** `C:\Users\capra\OneDrive\Desktop\GptTeste\.worktrees\proveras-platform`

## 1. Resumo executivo

O projeto existente foi preservado e continuado sem recriação. A fundação Next.js, os ativos visuais, os contratos públicos, a camada PostgreSQL, as migrations, as invariantes de concorrência, as fixtures de desenvolvimento e a primeira parte de identidade/autorização já estão implementados na branch de desenvolvimento.

A arquitetura operacional foi alinhada à decisão aprovada de usar Supabase somente como PostgreSQL gerenciado. Auth.js e o servidor Next.js permanecem responsáveis por identidade, sessões, autorização e regras de aplicação. O runtime usa `DATABASE_URL`; migrations e administração controlada usam `DATABASE_DIRECT_URL`.

O bloqueio de infraestrutura que impedia Testcontainers foi resolvido com a instalação do Docker Desktop. A execução real de PostgreSQL 17 está operacional e a configuração de integração do Vitest agora substitui o marcador `server-only` somente no projeto Node de testes. O código de produção continua importando o marcador real. Nenhum teste foi ignorado, mockado ou convertido para esconder falhas.

## 2. Trabalho implementado no repositório

### Fundação e ativos

- Aplicação Next.js App Router em JavaScript sob `apps/web`.
- Node.js 24 fixado para desenvolvimento e Vercel.
- Assets oficiais publicados em `apps/web/public/images/` sem alterar as cópias-fonte da raiz.
- Estrutura inicial de lint, build, checagem JSDoc/TypeScript e Vitest.
- Guia operacional de agentes e catálogo de referências de animação.

### Dados e contratos — Fase 1

- Contratos Zod estritos para disponibilidade, reserva, cancelamento e resultados de mutations.
- Respostas públicas de agenda sem identidade de clientes.
- Drizzle ORM, `pg` e migrations SQL versionadas.
- PostgreSQL com extensões `btree_gist` e `pgcrypto`.
- Schema para usuários, funcionárias, serviços, portfólio, agenda, bloqueios, agendamentos, créditos de cancelamento, integrações, privacidade e auditoria.
- Restrição GiST `schedule_entries_no_employee_overlap` para impedir atomicamente sobreposição por funcionária.
- Repositórios transacionais de agenda e créditos de cancelamento.
- Fixtures fictícias e idempotentes para desenvolvimento, sem preços validados ou dados reais.
- Testes de unidade e integração para migrations, concorrência, créditos e seeds.

### Supabase como PostgreSQL gerenciado

- Documentação atualizada para excluir Supabase Auth, cliente no navegador, Data API/PostgREST, Realtime, Edge Functions e Storage.
- `DATABASE_URL` reservada ao runtime serverless via Supavisor transaction mode.
- `DATABASE_DIRECT_URL` obrigatória para Drizzle Kit, migrations e administração controlada.
- Falha explícita quando a conexão direta não está configurada; não existe fallback silencioso para a conexão de runtime.
- Testes Testcontainers permanecem isolados e recebem uma URL PostgreSQL temporária explícita.

### Identidade e autorização — Fase 2 em andamento

- Contratos de identidade e validação de entrada.
- Hash e verificação de senha com envelope versionado.
- Migration e repositório para rate limiting de autenticação.
- Buckets HMAC sem armazenar e-mail ou atributo de rede em texto claro.
- O endurecimento adicional do rate limiting foi incorporado, incluindo entrada canônica de atributo de rede, payload HMAC com campos prefixados por comprimento e corridas reais com dez conexões PostgreSQL distintas.

## 3. Commits recentes desta retomada

- `52fec7a` — `docs: align operations with Supabase PostgreSQL`
- `1b48cb6` — `fix(db): separate runtime and migration connections`
- `c9bf447` — `fix(auth): harden rate limits and PostgreSQL races`
- `a2c9f0a` — merge dos documentos de animação já concluídos na `main`

O histórico anterior da branch contém os commits separados da Fase 1 e do início da Fase 2, mantendo lotes pequenos e revisáveis.

## 4. Instalações e configuração do computador

| Componente | Estado verificado |
|---|---|
| Windows Package Manager | `winget` 1.29.290 |
| WSL | WSL 2 configurado como padrão |
| Docker Desktop | 4.88.1 instalado pelo pacote oficial `Docker.DockerDesktop` |
| Docker Engine | 29.7.2, contexto `desktop-linux`, Linux/amd64 |
| Docker credential helper | `docker-credential-desktop.exe` instalado |
| PATH permanente | `C:\Program Files\Docker\Docker\resources\bin` registrado |
| PostgreSQL de teste | imagem oficial `postgres:17-alpine`; versão executada: PostgreSQL 17.11 |

A instalação não exigiu reinicialização. A tarefa atual foi iniciada antes da instalação e, por isso, precisou acrescentar o diretório do Docker apenas aos processos de teste. Novos terminais e novas tarefas herdarão o `PATH` permanente atualizado.

Comando de validação independente executado:

```powershell
docker run --rm postgres:17-alpine postgres --version
```

Resultado: `postgres (PostgreSQL) 17.11`.

## 5. Evidências de qualidade

| Verificação | Resultado mais recente |
|---|---|
| `npm ci` | 658 pacotes instalados com lockfile reproduzível |
| `npm run test:unit` | 14 arquivos e 93 testes aprovados |
| `npm run test:integration` | 5 arquivos e 17 testes aprovados em PostgreSQL 17 real; zero ignorados |
| `npm run typecheck` | aprovado |
| `npm run lint` | aprovado |
| `npm run build` | build de produção aprovado |
| `npm run db:check` com `DATABASE_DIRECT_URL` fictícia | schema aprovado pelo Drizzle Kit |
| `npm run db:check` sem conexão direta | falha esperada e explícita |
| `npm audit --omit=dev` | zero vulnerabilidades de produção |
| Revisão independente da separação de conexões | zero achados críticos, importantes ou menores após correção |
| Docker/PostgreSQL real | aprovado com PostgreSQL 17.11 em contêiner efêmero |

O `npm ci` reportou quatro vulnerabilidades moderadas somente no conjunto que inclui dependências de desenvolvimento; a auditoria restrita à produção retornou zero.

## 6. Resultado atual da integração PostgreSQL

A abordagem arquitetural foi aprovada e implementada. O projeto de integração do Vitest possui um alias exclusivo para um shim vazio de `server-only`; projetos unitários e o build Next.js não recebem esse alias. A primeira execução GREEN revelou ainda que o entrypoint oficial do PostgreSQL emite duas mensagens de prontidão — uma para o servidor temporário de inicialização e outra para o definitivo. O lifecycle de teste agora aguarda a segunda ocorrência.

Os testes reais também revelaram duas fontes de deadlock que antes ficavam ocultas pela falta do Docker:

- o trigger diferido de detalhe tentava promover locks de FK para `FOR UPDATE`; uma migration incremental usa `FOR NO KEY UPDATE`, compatível com `KEY SHARE`;
- inserções GiST concorrentes e conflitantes podiam aguardar circularmente os transaction IDs; um trigger `BEFORE` serializa escritas ativas pela linha da funcionária antes da verificação de exclusão.

A constraint GiST continua sendo a decisão final de disponibilidade e o repositório continua traduzindo somente a violação nomeada `23P01` para `SLOT_UNAVAILABLE`. O teste focal de migrations passou com 3/3 casos e a suíte completa passou com 17/17 testes em cinco arquivos.

## 7. Fase 2 iniciada

O lote de rate limiting de identidade foi concluído e versionado no commit `c9bf447` (`fix(auth): harden rate limits and PostgreSQL races`). O HMAC aceita somente o atributo de rede previamente reduzido no formato canônico, rejeita caracteres de controle e usa campos binários prefixados por comprimento, evitando ambiguidades de delimitação. Os testes provam separação entre login/reset, janela, bloqueio e dez tentativas concorrentes reais.

A revisão independente não encontrou itens críticos ou importantes. Dois itens menores de precisão dos testes foram corrigidos: a função de locking passa a ser inspecionada no catálogo PostgreSQL instalado, e a prova de privacidade verifica o atributo de rede canônico efetivamente usado pelos fixtures.

Na branch principal, a alteração local da proprietária que renomeia o produto para Proveras permanece intacta e não foi incluída neste worktree.

## 9. Próximos passos

1. Iniciar a Task 3 da Fase 2: repositórios de conta e criação segura por perfil.
2. Continuar identidade/autorização em lotes pequenos conforme o plano aprovado.

## 10. Riscos e bloqueadores externos futuros

- Credenciais reais de Supabase, Auth.js, Google OAuth, e-mail e Calendar ainda devem ser fornecidas somente por secret manager/ambientes da Vercel.
- Preços finais, funcionárias, serviços habilitados, WhatsApp, política LGPD validada e estratégia de backup/restore permanecem portões de lançamento.
- A licença proprietária do Docker Desktop deve ser observada conforme o contexto de uso da organização.
- Nenhuma publicação na Vercel ou uso de banco Supabase de produção foi realizado neste lote.
