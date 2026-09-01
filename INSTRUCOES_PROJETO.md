# Angelica's Beauty Salon — Especificação inicial

## 1. Visão geral

- **Produto:** site responsivo para o salão feminino **Proveras**.
- **Objetivo:** permitir que clientes se cadastrem, consultem disponibilidade e agendem serviços; permitir que a dona e funcionárias administrem suas agendas.
- **Perfis de acesso:** cliente, funcionária e administradora (dona).
- **Localização de operação:** Juiz de Fora, Minas Gerais, Brasil.
- **Fuso horário oficial:** `America/Sao_Paulo` (horário de Brasília).
- **Endereço:** R. José Dias Ferreira, N190 - São Francisco de Paula, Juiz de Fora - MG, 36087-470.
- **Telefone/WhatsApp:** (32) 9166-9076. O link `wa.me` deverá ser formado com o número normalizado para o padrão internacional, sem espaços ou pontuação, e validado pela administradora antes da publicação.
- **Fora do escopo atual:** avaliações de clientes e processamento real de pagamentos por PIX ou cartão.

## 2. Tecnologia e arquitetura

- **Front-end:** React, com Next.js.
- **Back-end:** JavaScript no Next.js, com Server Actions e Route Handlers como fronteira da aplicação.
- **Arquitetura:** MVVM: Views (páginas/componentes React), ViewModels (estado, validações e regras de apresentação) e Models (entidades, persistência e regras de domínio).
- **Banco de dados:** Supabase somente como PostgreSQL gerenciado, acessado no servidor com Drizzle e `pg` e evoluído por migrations SQL versionadas.
- **Conexões:** `DATABASE_URL` usa Supavisor em transaction mode no runtime serverless; `DATABASE_DIRECT_URL` usa a conexão direta (ou Supavisor session mode quando IPv6 não estiver disponível) para migrations e administração controlada.
- **Autenticação:** Auth.js com credenciais, OAuth 2.0 opcional, JWT e cookies seguros.
- **Produtos Supabase fora do escopo:** Supabase Auth, cliente Supabase no navegador, Data API/PostgREST, Realtime, Edge Functions e Storage.
- **Hospedagem inicial:** Vercel.
- **Integrações:** API oficial do Google Calendar, link direto do WhatsApp (`wa.me`) e exportação para Excel.

## 3. Requisitos funcionais

### 3.1 Contas e autenticação

- [ ] Disponibilizar páginas de cadastro, login e recuperação de senha.
- [ ] Clientes devem cadastrar nome, e-mail e senha.
- [ ] Validar e-mail com `@` e final `.com`; a validação deve ocorrer no cliente e no servidor.
- [ ] Exigir senha com pelo menos 8 caracteres.
- [ ] Recuperar senha enviando e-mail com token único, temporário e de uso único.
- [ ] Permitir login e encerramento de sessão com os mecanismos definidos de OAuth 2.0, JWT e cookies.
- [ ] A administradora deve criar contas de funcionárias. Não pode existir auto-cadastro de funcionária.
- [ ] Exibir no canto superior direito um acesso às informações da conta.

### 3.2 Perfis e permissões

- [ ] **Cliente:** criar, consultar e cancelar os próprios agendamentos.
- [ ] **Funcionária:** consultar, criar, editar e excluir somente os serviços/agendamentos atribuídos a ela.
- [ ] **Administradora:** gerir todas as agendas, bloqueios, serviços, preços e contas de funcionárias.
- [ ] Prever inicialmente uma administradora e aproximadamente três funcionárias, sem limitar o sistema a esse número.

### 3.3 Páginas

- [ ] **Login:** acesso e link para recuperação de senha e cadastro.
- [ ] **Cadastro:** criação de conta de cliente.
- [ ] **Recuperação de senha:** solicitação e redefinição por token recebido por e-mail.
- [ ] **Página principal:** apresentação do salão, portfólio de fotos, serviços, preços, atalho de agendamento e contato por WhatsApp.
- [ ] **Agendamento:** seleção de funcionária, serviço, data, horário disponível e pagamento.
- [ ] **Área da conta:** dados do perfil e histórico/próximos agendamentos.
- [ ] **Área de funcionária:** agenda pessoal e gestão de seus atendimentos.
- [ ] **Área administrativa:** contas de funcionárias, agenda geral, bloqueios, serviços/preços e exportação para Excel.

### 3.4 Serviços e agenda

- [ ] Cadastrar serviços com nome, categoria, duração, preço, funcionárias habilitadas e status ativo/inativo.
- [ ] Oferecer inicialmente os serviços abaixo; preços deverão ser definidos pela administradora antes da publicação.

| Serviço | Duração inicial | Observação |
|---|---:|---|
| Manicure (unhas das mãos) | 30 min | |
| Pedicure (unhas dos pés) | 30 min | |
| Corte feminino | 60 min | |
| Escova | 45–75 min | Varia conforme o comprimento; iniciar com 60 min, ajustável. |
| Progressiva | 3 h | Duração configurável conforme comprimento/técnica. |
| Hidratação capilar | 30 min | |
| Design de sobrancelhas | 30 min | |
| Extensão de cílios | 90 min | |
| Manicure + pedicure | 60 min | |

> As durações são parâmetros iniciais configuráveis; referências de agenda de salões indicam manicure e pedicure de 30 min, escova de 45–75 min, corte feminino de 30–60 min e progressiva de cerca de 3 h ou mais. Fontes: [AgendaPlus](https://useagendaplus.com.br/agenda-para-saloes-de-beleza) e [Salão Samaranda](https://salaosamaranda.com.br/profissionais/rogeria-conceicao).

- [ ] Permitir agendamento todos os dias e em qualquer horário, exceto nos períodos bloqueados pela administradora.
- [ ] Permitir à administradora bloquear horários para indicar abertura, fechamento ou indisponibilidade.
- [ ] Exigir antecedência mínima de 2 horas para criar um agendamento.
- [ ] Impedir sobreposição: cada funcionária atende somente uma cliente por vez.
- [ ] Permitir atendimentos simultâneos somente com funcionárias diferentes.
- [ ] Ao confirmar um agendamento, tornar o intervalo correspondente indisponível imediatamente para todas as demais clientes. Essa reserva deve ser confirmada por validação atômica no servidor e no PostgreSQL; a interface apenas reflete o estado, nunca é a única proteção contra reserva dupla.
- [ ] Atualizar a disponibilidade visível sem exigir recarregamento completo da página após uma reserva, cancelamento ou bloqueio. Se outra cliente ocupar o horário durante o fluxo, a tentativa atual deve falhar com mensagem clara e a grade deve recarregar os horários disponíveis.
- [ ] Na grade de agenda, cada intervalo indisponível deve exibir a logo oficial do salão como indicador visual, com o rótulo acessível **“Horário indisponível”**. Não exibir nome, e-mail, serviço ou qualquer dado da cliente que fez a reserva.
- [ ] Após uma reserva, calcular e mostrar automaticamente o próximo horário disponível da funcionária conforme a duração do serviço.
- [ ] Para dois serviços, a cliente deve criar agendamentos consecutivos e separados; o segundo só poderá ser confirmado se o horário seguinte estiver disponível.
- [ ] Permitir que a cliente cancele a qualquer momento; o horário deve ser liberado imediatamente.
- [ ] Cada cliente terá três créditos de cancelamento. Ao cancelar, um crédito é consumido e volta a ficar disponível apenas 30 dias após aquele uso. O sistema deve impedir um quarto cancelamento enquanto não houver crédito disponível e informar a data de renovação de cada crédito.
- [ ] Remarcação será feita por cancelamento seguido de nova reserva, sujeita à disponibilidade atual.
- [ ] Registrar no banco cliente, funcionária, serviço, início, término, valor, status e forma de pagamento do agendamento.
- [ ] Sincronizar/exportar agendamentos ao Google Calendar pela API oficial, conforme autorização e regras que ainda serão definidas.
- [ ] Exportar dados de agenda para arquivo Excel (`.xlsx`).
- [ ] Enviar e-mails automáticos de lembrete de atendimento.

### 3.5 Pagamentos

- [ ] Exibir preço do serviço e um seletor de pagamento: **cartão**, **dinheiro** ou **PIX**.
- [ ] Mostrar a forma escolhida para a administradora e para a funcionária responsável.
- [ ] Ao selecionar dinheiro, informar a funcionária de que o pagamento será no local.
- [ ] Ao selecionar PIX, exibir QR Code ilustrativo/não válido e a mensagem: `ERRO: OPÇÃO BLOQUEADA. PAGUE NO LOCAL.`
- [ ] Ao selecionar cartão, exibir a tela de dados de cartão; ao tentar continuar, mostrar: `ERRO: OPÇÃO BLOQUEADA. PAGUE NO LOCAL.`
- [ ] Não processar, transmitir nem armazenar dados de cartão nesta fase.

### 3.6 Comunicação e conteúdo

- [ ] Exibir contato via link direto para o WhatsApp da dona do salão.
- [ ] Exibir fotos de portfólio nas áreas de apresentação definidas no design.
- [ ] Não incluir avaliações de clientes nesta versão.

### 3.7 Ativos visuais do salão

- [ ] Usar a logo oficial em `logoSalao.jpg` no cabeçalho, rodapé, página de login e como indicador de horário indisponível na agenda.
- [ ] Organizar os arquivos visuais no projeto Next.js em `public/images/logo/` e `public/images/portfolio/`, preservando os nomes-base fornecidos. A logo deve ser acessada como `/images/logo/logoSalao.jpg`; as fotos de portfólio, como `/images/portfolio/<nome-do-arquivo>`.
- [ ] Renderizar logo e portfólio com `next/image`, definindo dimensões, `sizes`, carregamento preguiçoso para fotos fora da primeira dobra e texto alternativo específico. A logo deve ter texto alternativo `Angelica's Beauty Salon`; fotos decorativas podem ter texto alternativo vazio.
- [ ] Não distorcer, recortar de modo que descaracterize, nem aplicar filtro que reduza a legibilidade da logo. Manter proporção e uma área de respiro adequada.
- [ ] Incluir no catálogo de portfólio os seguintes arquivos fornecidos, com categoria e texto alternativo revisáveis pela administradora:

| Arquivo | Categoria inicial | Texto alternativo inicial |
|---|---|---|
| `ProtifolioUnhas.png` | Unhas | Trabalho de unhas do Angelica's Beauty Salon. |
| `ProtifolioTransas2.png` | Tranças | Tranças realizadas no Angelica's Beauty Salon. |
| `ProtifolioSobrancelhas2.png` | Sobrancelhas | Design de sobrancelhas do Angelica's Beauty Salon. |
| `ProtifolioSobrancelha.png` | Sobrancelhas | Design de sobrancelhas do Angelica's Beauty Salon. |
| `PortifolioTransas.png` | Tranças | Tranças realizadas no Angelica's Beauty Salon. |
| `PortifolioOndulado3.png` | Cabelos ondulados | Cabelo ondulado finalizado no Angelica's Beauty Salon. |
| `PortifolioOndulado2.png` | Cabelos ondulados | Cabelo ondulado finalizado no Angelica's Beauty Salon. |
| `PortifolioOndulado.png` | Cabelos ondulados | Cabelo ondulado finalizado no Angelica's Beauty Salon. |
| `PortifolioLiso3.png` | Cabelos lisos | Cabelo liso finalizado no Angelica's Beauty Salon. |
| `PortifolioLiso2.png` | Cabelos lisos | Cabelo liso finalizado no Angelica's Beauty Salon. |
| `PortifolioLiso.png` | Cabelos lisos | Cabelo liso finalizado no Angelica's Beauty Salon. |
| `PortifolioBocas.png` | Maquiagem | Maquiagem labial realizada no Angelica's Beauty Salon. |

## 4. Requisitos não funcionais

### 4.1 Segurança e privacidade

- [ ] Armazenar senhas exclusivamente como hash forte com salt (por exemplo, Argon2id ou bcrypt); nunca salvar senhas em texto puro.
- [ ] Proteger dados pessoais em trânsito com HTTPS e aplicar controles de acesso por perfil no servidor.
- [ ] Usar cookies `HttpOnly`, `Secure` e `SameSite` apropriados; evitar expor tokens sensíveis ao JavaScript do navegador.
- [ ] Implementar expiração, uso único e armazenamento seguro de tokens de recuperação de senha.
- [ ] Adequar a coleta, o uso e a retenção de dados à LGPD, incluindo política de privacidade, finalidade definida e mínimo necessário de dados.
- [ ] Não guardar dados completos de cartão.

### 4.2 Desempenho e experiência

- [ ] Ser responsivo para celular, tablet e desktop.
- [ ] Funcionar nas versões estáveis mais recentes de Google Chrome, Microsoft Edge, Mozilla Firefox e Safari. Antes de cada publicação, executar testes manuais nesses quatro navegadores e em pelo menos um dispositivo móvel.
- [ ] Manter interações de interface fluidas, sem atraso perceptível de entrada; otimizar imagens, carregamento de páginas e consultas de agenda.
- [ ] Fornecer feedback visual para cada botão (mudança de estado, carregamento, confirmação ou erro) em até **500 ms** após clique, toque ou acionamento pelo teclado em 95% das interações. Operações de rede que levarem mais tempo devem exibir estado de carregamento imediatamente; o tempo de conclusão da operação deve ser medido separadamente.
- [ ] Informar carregamentos, erros de validação, indisponibilidade de horário e confirmações de forma clara.
- [ ] Garantir acessibilidade básica: contraste suficiente, navegação por teclado, rótulos de campos e mensagens compreensíveis.

### 4.3 Confiabilidade e dados

- [ ] Impedir conflitos de agenda mesmo em reservas simultâneas, validando disponibilidade no servidor e no banco de dados.
- [ ] Registrar datas e horários com fuso configurado do salão e apresentar horários de forma consistente ao usuário.
- [ ] Usar `America/Sao_Paulo` como fuso de negócio para todos os agendamentos, bloqueios, lembretes e eventos exportados ao Google Calendar.
- [ ] Manter backups e plano de recuperação do banco de dados a definir antes da produção.
- [ ] Tratar falhas de integração com Google Calendar e e-mail sem perder o agendamento principal.

### 4.4 Manutenibilidade e entrega

- [ ] Organizar código, testes e documentação de acordo com a separação MVVM.
- [ ] Configurar ambientes de desenvolvimento, homologação e produção, com variáveis de ambiente fora do repositório.
- [ ] Hospedar inicialmente na Vercel e documentar o processo de implantação.

## 5. Modelo de dados inicial

| Entidade | Dados principais |
|---|---|
| Usuário | id, nome, e-mail, hash da senha, perfil, status |
| Funcionária | id de usuário, especialidades, status |
| Serviço | id, nome, duração, preço, ativo |
| Agendamento | id, cliente, funcionária, serviço, início, fim, status, pagamento |
| Bloqueio de agenda | id, intervalo, motivo, criado por |
| Token de recuperação | usuário, hash do token, expiração, utilizado em |

## 6. Pontos a definir antes de iniciar o desenvolvimento

1. Número de WhatsApp do salão e chave/identificação PIX a ser exibida quando o pagamento real for habilitado.
2. Endereço completo do salão em Juiz de Fora para publicação e contato presencial.
3. Lista final de serviços, preços, durações e quais funcionárias podem prestar cada serviço.
4. Fotos de portfólio, logotipo e identidade visual além da paleta rosa.
5. Texto da política de privacidade, prazo de retenção de dados e canal para solicitações LGPD.
6. Provedor de envio de e-mail, remetente e conteúdo/frequência dos lembretes.
7. Regra de cancelamento: embora hoje seja permitido cancelar a qualquer momento, confirmar se haverá limite, multa ou aviso especial futuramente.
8. Regra de integração do Google Calendar: uma agenda única do salão ou uma agenda por funcionária; quais eventos devem ser criados/atualizados.
9. Critérios de teste e aceitação, inclusive comportamento desejado quando duas pessoas tentarem reservar o mesmo horário.

## 7. Diretrizes visuais

- Tema geral rosa.
- Modo claro: rosa e branco.
- Modo escuro: preto e rosa.
- Disponibilizar alternância claro/escuro no canto superior direito.

## 8. Avaliação preventiva: riscos, problemas e soluções

> **Estado da revisão:** a fundação Next.js e a Fase 1 de dados e contratos já existem na branch de desenvolvimento; identidade e autorização estão em andamento. Os riscos abaixo continuam sendo portões de revisão para os lotes correspondentes.

| Área | Possível problema | Solução recomendada |
|---|---|---|
| Autenticação | OAuth 2.0, JWT e cookies foram escolhidos, mas não está definido se OAuth será login social, nem como ele coexistirá com login por e-mail e senha. | Definir os provedores OAuth permitidos e adotar uma única estratégia de sessão: cookie seguro contendo uma sessão/JWT de curta duração, com renovação controlada. |
| Agenda simultânea | Duas pessoas podem escolher o mesmo horário antes de uma delas finalizar, causando dupla reserva. | Validar a disponibilidade no servidor dentro de uma transação PostgreSQL e criar uma restrição contra sobreposição por funcionária. Nunca confiar apenas na validação visual do front-end. |
| Regra de serviços em sequência | A regra exige que dois serviços sejam marcados separadamente. Sem orientação clara, o usuário pode tentar horários incompatíveis ou se confundir. | Exibir o término calculado do primeiro serviço e sugerir automaticamente o próximo horário disponível; manter a confirmação separada conforme a regra de negócio. |
| Horário de funcionamento | "Segunda a segunda, qualquer hora" com bloqueios manuais pode tornar a agenda difícil de operar e permitir reservas indevidas quando ninguém estiver disponível. | Cadastrar uma agenda-base por funcionária e exceções/bloqueios. A administradora pode liberar horários extraordinários quando necessário. |
| Duração e capacidade | Duração varia por serviço, cabelo e profissional; não há tempo de preparo/limpeza nem especialidades definidas. | Tornar duração, preço, intervalo de preparo e funcionárias habilitadas configuráveis por serviço. Confirmar a tabela final antes do lançamento. |
| Google Calendar | Não está definido se haverá uma agenda geral ou uma por funcionária; falhas de sincronização podem criar divergências. | Escolher o banco do sistema como fonte de verdade, definir o modelo de agendas e registrar tentativas/erros de sincronização para reprocessamento. |
| Banco na Vercel | Conexões diretas ou pools grandes no runtime serverless podem esgotar o PostgreSQL. | Usar Supabase Supavisor transaction mode em `DATABASE_URL` com pool de aplicação pequeno; reservar `DATABASE_DIRECT_URL` para migrations, inspeção e administração controlada. |
| Recuperação e lembretes por e-mail | O provedor de envio, domínio remetente e regras de expiração não foram definidos; mensagens podem cair em spam. | Escolher um serviço transacional, configurar domínio/remetente e SPF/DKIM/DMARC, e definir expiração do token e cronograma dos lembretes. |
| Pagamento | Coletar dados de cartão, mesmo sem cobrar, aumenta risco de privacidade e de conformidade PCI. | Exibir apenas campos de demonstração claramente identificados; não permitir envio, armazenamento ou registro de números de cartão. Preferir bloquear a opção antes da coleta em produção. |
| LGPD | "Dados em hash" protege somente senhas; e-mail, agenda e outros dados pessoais continuam sensíveis. | Hash para senhas; HTTPS, controle de acesso, minimização, retenção definida, política de privacidade e processo para pedidos dos titulares para os demais dados. |
| Portfólio | Fotos de clientes podem demandar autorização de uso de imagem e podem deixar a página lenta. | Guardar a comprovação de consentimento, otimizar/redimensionar as imagens e carregá-las de forma responsiva. |
| Compatibilidade e desempenho | Sem metas testáveis, o requisito de rapidez pode ser interpretado de maneiras diferentes. | Aplicar os critérios mensuráveis da seção 4.2 e testar Chrome, Edge, Firefox e Safari antes de cada entrega. |
| Dados de negócio | Ainda faltam WhatsApp, endereço/fuso, preços, fotos, serviços finais e número/configuração de agendas. | Resolver os itens da seção 6 antes de abrir o site ao público; eles são dependências de implantação, não detalhes de interface. |

## 9. Política de privacidade e LGPD

> **Versão inicial — validar juridicamente antes da publicação.** Esta política será exibida em uma página pública do site e aceita pela cliente no cadastro, sem prejudicar os direitos previstos na Lei Geral de Proteção de Dados Pessoais (LGPD).

### Política de Privacidade — Angelica's Beauty Salon

O **Angelica's Beauty Salon**, situado em Juiz de Fora/MG, trata dados pessoais para viabilizar o cadastro, autenticação, agendamento, atendimento, comunicação e administração do salão. O salão é o controlador dos dados tratados nesta plataforma; a administradora do salão é responsável por encaminhar as solicitações de privacidade.

**Dados coletados.** Podemos tratar nome, e-mail, senha protegida por hash, perfil de acesso, agendamentos, serviço escolhido, funcionária responsável, forma de pagamento escolhida, histórico de cancelamentos, registros de suporte e dados técnicos necessários à segurança da sessão. Não armazenamos senhas em texto puro, dados completos de cartão ou dados de pagamento PIX nesta fase.

**Finalidades e compartilhamento.** Os dados são utilizados para criar e proteger a conta, exibir disponibilidade, confirmar e lembrar agendamentos, gerir a agenda do salão, atender solicitações e prevenir uso indevido. Os dados poderão ser compartilhados somente quando necessário com os operadores técnicos do serviço — hospedagem na Vercel, Supabase exclusivamente como infraestrutura PostgreSQL gerenciada, envio de e-mail e Google Calendar quando a integração for autorizada/configurada — ou por obrigação legal. O salão não vende dados pessoais. A arquitetura atual não usa Supabase Auth nem envia dados de identidade por um cliente Supabase no navegador.

**Segurança.** O sistema deve usar HTTPS, controles de acesso por perfil, senhas protegidas por hash forte, cookies de sessão seguros, registros de segurança e acesso limitado aos dados conforme a função de cada usuária. Nenhuma medida de segurança elimina todos os riscos; incidentes serão tratados conforme as obrigações aplicáveis.

**Direitos da titular.** A cliente pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, portabilidade quando aplicável, anonimização, bloqueio, eliminação de dados tratados de forma desnecessária ou com consentimento, revogação do consentimento e revisão de decisões automatizadas, nos limites legais.

**Canal LGPD.** O site disponibilizará o formulário público **“Privacidade e LGPD”** na rota `/privacidade`, acessível com ou sem login. A solicitação receberá um protocolo e será encaminhada à administradora do salão. Para proteger a cliente, o salão poderá confirmar sua identidade antes de revelar ou alterar dados. Confirmação de tratamento e acesso simples serão atendidos imediatamente quando possível; pedidos que exigirem informação detalhada receberão resposta em até 15 dias, salvo prazo legal ou justificativa aplicável.

**Retenção e eliminação.** Os dados serão retidos pelos prazos abaixo e depois eliminados ou anonimizados de forma segura, exceto quando a conservação for necessária para cumprir obrigação legal/regulatória, exercício de direitos ou prevenção de fraude:

| Categoria | Prazo de retenção proposto |
|---|---|
| Conta, dados de perfil e histórico de agendamentos | Enquanto a conta estiver ativa e por 5 anos após o último atendimento ou encerramento, salvo conservação legal necessária. |
| Registro de forma de pagamento e cancelamentos | 5 anos após o atendimento/cancelamento, sem dados de cartão ou PIX. |
| Solicitações LGPD e evidências de atendimento | 5 anos após o encerramento da solicitação. |
| Registros técnicos e de segurança | 6 meses, salvo investigação de incidente ou obrigação de retenção. |
| Token de recuperação de senha | Até 24 horas, ou imediatamente após o uso. |
| Backups | Até 90 dias, com eliminação no ciclo de retenção de backup. |

Esta política deve ser revista quando houver alteração relevante das finalidades, dos fornecedores, da integração com Google Calendar ou do tratamento de dados. Caso a cliente não tenha sua solicitação atendida, poderá buscar os canais de proteção ao consumidor e a Autoridade Nacional de Proteção de Dados (ANPD), conforme aplicável.

> Referência normativa: a ANPD informa que o titular pode solicitar informações, acesso, correção, eliminação em hipóteses aplicáveis e revogação de consentimento; pedidos detalhados de confirmação/acesso têm referência de resposta em até 15 dias. Fonte: [Direito dos Titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## 10. Plano de execução com agentes coordenados no Codex

### 10.1 Estrutura inicial do time

| Papel | Modelo e esforço inicial | Responsabilidade | Limite de atuação |
|---|---|---|---|
| Arquiteto-chefe | `gpt-5.6-sol`, alto | Decompor o trabalho, manter a arquitetura, definir contratos, revisar entregas e integrar mudanças. | Não deve reescrever o trabalho de outro agente sem abrir uma tarefa de correção. |
| Desenvolvedor front-end | `gpt-5.6-terra`, médio/alto | React/Next.js, acessibilidade, responsividade, páginas, tema e estados de interface. | Não altera esquema/migrações do banco nem regras de autorização no servidor. |
| Desenvolvedor back-end | `gpt-5.6-terra`, alto | Autenticação, autorização, APIs/Server Actions, agenda, integrações e regras de negócio. | Não altera interfaces públicas sem aprovar o contrato com o arquiteto. |
| Especialista de banco de dados | `gpt-5.6-terra`, alto | Modelagem PostgreSQL, migrations, integridade, concorrência de agenda, consultas e backup. | Não incorpora regras de interface nem credenciais reais. |

> Alternativa: o arquiteto pode usar `gpt-5.3-codex` para tarefas de implementação agentiva excepcionalmente complexas, após validar custo e qualidade. A escolha padrão permanece na família GPT-5.6: Sol para coordenação complexa, Terra para construção equilibrada e Luna para tarefas de alto volume e baixo risco. Referências: [modelos OpenAI](https://developers.openai.com/api/docs/models) e [guia de modelos](https://developers.openai.com/api/docs/guides/latest-model).

### 10.2 Protocolo de coordenação

Subagentes são opcionais e permanecem dentro da tarefa atual do Codex. Use-os somente quando houver pelo menos duas tarefas independentes, sem arquivos compartilhados e com ganho real de tempo; trabalho pequeno, documental, sequencial ou fortemente acoplado permanece com o agente principal.

1. Quando houver delegação, o arquiteto-chefe anuncia no comentário quais agentes foram iniciados, seus objetivos, arquivos permitidos e verificações exigidas.
2. Nenhum subagente edita simultaneamente o mesmo arquivo. Quando duas tarefas dependerem do mesmo contrato, o arquiteto define a interface primeiro e libera as tarefas em sequência.
3. O especialista de banco entrega primeiro migrations, restrições e uma descrição dos contratos de dados; o back-end consome esses contratos; o front-end consome os contratos de API/ações publicados pelo back-end.
4. Cada subagente implementa apenas seu lote, executa testes e informa: arquivos alterados, decisões tomadas, comandos executados, resultados e riscos restantes.
5. O arquiteto revisa a entrega contra os critérios de aceitação, inspeciona o diff e repete as verificações relevantes antes de liberar a próxima etapa dependente.
6. Tarefas repetitivas de baixo risco, como resumo de testes, inventário de arquivos e verificação de documentação, podem usar `gpt-5.6-luna`; decisões de segurança, dados e regras de agenda permanecem sob revisão do arquiteto.

### 10.3 Ondas de implementação

1. **Fundação:** criar projeto Next.js, padrões MVVM, lint/testes, variáveis de ambiente, tema e documentação de execução.
2. **Dados e contratos:** modelar PostgreSQL, criar migrations, serviços, funcionárias, clientes, bloqueios, agendamentos e créditos de cancelamento; testar conflitos de horário.
3. **Identidade e autorização:** cadastro, login, sessão segura, recuperação de senha e controle cliente/funcionária/admin.
4. **Agenda:** disponibilidade, bloqueios, duração de serviço, antecedência mínima, cancelamento e restrições de concorrência.
5. **Experiência do cliente:** página principal, portfólio, conta, agendamento, feedback de até 500 ms e compatibilidade entre navegadores.
6. **Administração e integrações:** painéis, gestão de funcionárias/serviços/preços, Excel, Google Calendar, WhatsApp e e-mails de lembrete.
7. **Qualidade e lançamento:** testes de segurança, acessibilidade, navegador, desempenho, backup/recuperação, revisão LGPD e implantação na Vercel.

### 10.4 Portões de qualidade

- Cada onda deve terminar com testes automatizados relevantes, lint, verificação de tipos, build de produção e revisão do arquiteto-chefe.
- A reserva concorrente do mesmo horário, perfis sem permissão e os créditos de cancelamento devem ter testes de integração obrigatórios.
- Antes de publicar, validar os fluxos principais em Chrome, Edge, Firefox e Safari, inclusive em celular.
- Credenciais reais nunca devem aparecer em prompts, commits, código ou relatórios de subagentes; usar variáveis de ambiente e ambientes de teste.

## 11. Fluxos obrigatórios de skills para agentes

As skills são carregadas somente quando a etapa atual exigir. Os fluxos abaixo definem a ordem do ciclo de vida, não uma obrigação de ativar todas as skills no primeiro prompt. O agente lê este documento uma vez no início e depois usa buscas e trechos delimitados para recuperar contexto, evitando carregar arquivos extensos, logs, artefatos gerados ou lockfiles sem necessidade.

### 11.1 Criação ou alteração de funcionalidade

```text
$brainstorming
→ $writing-plans
→ $using-git-worktrees
→ $test-driven-development
→ implementação
→ $requesting-code-review
→ $verification-before-completion
→ $finishing-a-development-branch
```

- `$brainstorming`: usar somente quando uma decisão de comportamento ou arquitetura ainda não estiver aprovada.
- `$writing-plans`: usar depois da aprovação para mudanças arquiteturais ou trabalhos de várias etapas.
- `$using-git-worktrees`: verificar isolamento quando começar a execução de um plano aprovado.
- `$test-driven-development`: escrever e executar primeiro o teste que deve falhar; só então implementar o mínimo necessário.
- `$requesting-code-review`: solicitar revisão independente ao término de cada tarefa significativa e corrigir itens críticos/importantes.
- `$verification-before-completion`: executar verificações atuais — testes, lint, tipos, build e requisitos — antes de declarar a tarefa concluída.
- `$finishing-a-development-branch`: somente após a suíte verde, apresentar à administradora as opções de integração da branch; nunca excluir trabalho sem autorização explícita.
- `$systematic-debugging`: carregar somente depois de ocorrer erro, teste falho, comportamento inesperado ou problema de desempenho; investigar e registrar a causa raiz antes de corrigir.

### 11.2 Criação de nova interface

```text
$brainstorming
→ $ui-ux-pro-max
→ $impeccable shape
→ $design-system
→ $ui-styling
→ $impeccable polish
→ verificação visual
```

- `$ui-ux-pro-max`: definir orientação de UX, acessibilidade, toque, desempenho, responsividade e padrões apropriados ao Next.js.
- `$impeccable shape`: estruturar o fluxo e os estados da interface antes de escrever componentes.
- `$design-system`: definir tokens em três camadas — primitivos, semânticos e de componente — para rosa/branco no modo claro e preto/rosa no modo escuro.
- `$ui-styling`: implementar componentes acessíveis, responsivos e consistentes, preferencialmente com Tailwind e primitives acessíveis aprovadas para o projeto.
- `$impeccable polish`: realizar uma rodada limitada de refinamento de hierarquia, contraste, foco, textos, estados vazios/erro e acabamento.
- Verificação visual: conferir desktop e celular, modo claro/escuro, imagens, logo, foco de teclado, ausência de overflow e console sem erros. O fluxo da agenda deve mostrar corretamente a logo em horários indisponíveis.

### 11.3 Revisão ou melhoria de interface existente

```text
$impeccable critique
→ $ui-ux-pro-max (decisões específicas)
→ $impeccable [clarify/layout/adapt/harden]
→ $impeccable polish
```

- `$impeccable critique`: identificar e priorizar problemas de hierarquia, acessibilidade, consistência e fluxo de uso antes de editar.
- `$ui-ux-pro-max`: pesquisar a orientação específica para o problema encontrado, sem aplicar recomendações sem adequação ao projeto.
- `$impeccable clarify`, `layout`, `adapt` ou `harden`: escolher somente os comandos necessários para melhorar textos, espaçamento/hierarquia, responsividade ou robustez de produção.
- `$impeccable polish`: executar no máximo duas rodadas de inspeção visual e correção, evitando polimento indefinido.

### 11.4 Regras de coordenação das skills

- O arquiteto-chefe declara skills, arquivos permitidos e verificações no momento em que cada agente ou lote é iniciado, sem pré-carregar skills de fases futuras.
- O agente de banco segue o fluxo de funcionalidade para schema, migrations e concorrência e carrega `$systematic-debugging` apenas diante de uma falha real.
- O agente de back-end usa o fluxo de funcionalidade e adiciona testes de integração para autorização, reserva atômica, cancelamento e disponibilidade.
- O agente de front-end usa o fluxo de funcionalidade e, para qualquer superfície nova ou revisada, o fluxo de interface correspondente.
- Quando houver subagentes, o arquiteto anuncia o início, informa quais concluíram e resume arquivos e evidências produzidos. Nenhum agente pode marcar uma tarefa como concluída por suposição: deve anexar comandos, resultados, arquivos alterados e riscos remanescentes.
