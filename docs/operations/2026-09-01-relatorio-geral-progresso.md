# Relatório geral de progresso — Proveras

**Data:** 1º de setembro de 2026
**Branch de desenvolvimento:** `codex/proveras-platform`
**Worktree:** `C:\Users\capra\OneDrive\Desktop\GptTeste\.worktrees\proveras-platform`

## 1. Resumo executivo

O projeto existente foi preservado e continuado sem recriação. A fundação Next.js, os ativos visuais, os contratos públicos, a camada PostgreSQL, as migrations, as invariantes de concorrência, as fixtures de desenvolvimento e a primeira parte de identidade/autorização já estão implementados na branch de desenvolvimento.

A arquitetura operacional foi alinhada à decisão aprovada de usar Supabase somente como PostgreSQL gerenciado. Auth.js e o servidor Next.js permanecem responsáveis por identidade, sessões, autorização e regras de aplicação. O runtime usa `DATABASE_URL`; migrations e administração controlada usam `DATABASE_DIRECT_URL`.

O bloqueio de infraestrutura que impedia Testcontainers foi resolvido com a instalação do Docker Desktop. A execução real de PostgreSQL 17 agora funciona, mas revelou uma pendência separada na configuração do Vitest: módulos protegidos por `server-only` são resolvidos pelo ramo de Client Component nos testes de integração. Nenhum teste foi ignorado, mockado ou convertido para esconder essa falha.

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
- Alterações adicionais de endurecimento do rate limiting permanecem locais e ainda não foram incorporadas a um commit final.

## 3. Commits recentes desta retomada

- `52fec7a` — `docs: align operations with Supabase PostgreSQL`
- `1b48cb6` — `fix(db): separate runtime and migration connections`
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
| `npm run test:unit` | 14 arquivos e 94 testes aprovados |
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

Antes da instalação, os testes falhavam porque nenhum runtime Docker/Podman/PostgreSQL estava disponível. Depois da instalação:

1. Testcontainers encontrou o daemon Docker.
2. O helper de credenciais foi encontrado ao atualizar o `PATH` do processo.
3. A imagem oficial PostgreSQL 17 foi iniciada.
4. A suíte alcançou a importação dos módulos server-only.
5. Dezesseis testes falharam no mesmo limite de módulo; um teste foi aprovado.

Erro compartilhado atual:

```text
This module cannot be imported from a Client Component module.
It should only be used from a Server Component.
```

A causa é a resolução condicional do pacote marcador `server-only` no worker do Vitest. Três hipóteses foram testadas e revertidas quando não resolveram o problema de forma segura:

- `resolve.conditions`: aplica-se ao ambiente client e foi ignorado pelo teste Node.
- `ssr.resolve.conditions`: resolveu `server-only`, mas alterou a interoperabilidade CommonJS de `pg`.
- `test.execArgv`: não alcançou a resolução externalizada do marcador.

Nenhuma dessas tentativas permaneceu no diff.

## 7. Decisão técnica pendente

A direção recomendada para o próximo lote é configurar um alias exclusivamente no projeto de integração, apontando `server-only` para um módulo vazio de teste. O pacote é um marcador de fronteira em tempo de build e não possui comportamento de produção; o alias ficaria restrito ao runner Node de integração, enquanto o código entregue continuaria importando e preservando `server-only` normalmente.

Antes de implementar essa quarta abordagem, o fluxo de debugging exige aprovação arquitetural explícita, porque três configurações anteriores falharam e uma delas afetou `pg`.

## 8. Estado das alterações locais preservadas

Na worktree de desenvolvimento permanecem modificados, sem commit novo:

- `apps/web/src/db/migrations.integration.test.js`
- `apps/web/src/features/auth/rate-limit-repository.js`
- `apps/web/src/features/auth/rate-limit-repository.test.js`
- `apps/web/src/features/auth/rate-limit.integration.test.js`

Essas mudanças já existiam antes da instalação e foram preservadas. Na branch principal, a alteração local da proprietária que renomeia o produto para Proveras também permanece intacta.

## 9. Próximos passos

1. Aprovar e implementar a fronteira de teste para `server-only` com TDD.
2. Reexecutar o teste focal de migrations contra PostgreSQL 17.
3. Reexecutar toda a suíte de integração, sem testes ignorados.
4. Repetir unitários, typecheck, lint, build, `db:check` e auditoria.
5. Revisar e concluir o lote local de rate limiting da Fase 2.
6. Continuar identidade/autorização em lotes pequenos conforme o plano aprovado.

## 10. Riscos e bloqueadores externos futuros

- Credenciais reais de Supabase, Auth.js, Google OAuth, e-mail e Calendar ainda devem ser fornecidas somente por secret manager/ambientes da Vercel.
- Preços finais, funcionárias, serviços habilitados, WhatsApp, política LGPD validada e estratégia de backup/restore permanecem portões de lançamento.
- A licença proprietária do Docker Desktop deve ser observada conforme o contexto de uso da organização.
- Nenhuma publicação na Vercel ou uso de banco Supabase de produção foi realizado neste lote.
