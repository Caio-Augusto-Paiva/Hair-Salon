# Referências de animações do frontend

## Finalidade

Este arquivo é o catálogo de animações aprovadas como referência pela proprietária do Proveras e o registro das decisões tomadas pelos agentes. Ele orienta o movimento visual do site; não autoriza copiar integralmente o design, o código, os textos, as imagens ou a identidade de terceiros.

A proprietária pode adicionar referências a qualquer momento usando o modelo abaixo. Antes de desenhar ou implementar animações, principalmente o agente de frontend deve ler este arquivo e considerar somente as referências relacionadas à superfície em desenvolvimento.

## Princípios do movimento

- Priorizar movimento sutil e funcional que esclareça hierarquia, estado ou resultado de uma ação.
- Não atrasar login, navegação, consulta de disponibilidade, confirmação ou cancelamento de agendamento.
- Preferir `opacity` e `transform` em efeitos simples para evitar recálculo de layout.
- Usar CSS para microinterações simples; adicionar biblioteca React somente quando presença, layout ou gestos coordenados justificarem o custo.
- Respeitar `prefers-reduced-motion` e oferecer uma experiência completa sem animação.
- Preservar foco de teclado, leitura por tecnologias assistivas e alvos de toque.
- Evitar layout shift, rolagem horizontal, cintilação, autoplay com distração contínua e parallax intenso.
- Validar celular e desktop, temas claro e escuro e dispositivos representativos de desempenho intermediário.
- Não baixar nem incorporar um ativo sem verificar licença e origem.
- Não introduzir WebGL, shaders, vídeo de fundo ou dependência pesada sem aprovação arquitetural específica.

## Como a proprietária adiciona uma referência

Copie este bloco para a seção **Referências escolhidas pela proprietária** e preencha o que souber. O link e a descrição do que chamou atenção são os campos mínimos.

```md
### Nome da referência

- Link:
- Site/componente:
- Aplicar em:
- O que gostei:
- O que não copiar:
- Intensidade: sutil | moderada | chamativa
- Prioridade: desejada | opcional | inspiração
- Observações para celular:
```

## Referências escolhidas pela proprietária

<!--
Adicione novas referências abaixo deste comentário. Não inclua senhas,
tokens, dados pessoais ou links privados que dependam de uma conta.
-->

Nenhuma referência foi registrada ainda.

## Protocolo obrigatório para os agentes

### 1. Selecionar o escopo

Identifique a superfície atual, por exemplo: hero, navegação, card de serviço, portfólio, agenda, modal, formulário, carregamento ou confirmação. Não avalie animações sem relação com essa superfície.

### 2. Comparar referências

Compare no máximo três referências aplicáveis. Para cada uma, considere:

- propósito da animação;
- compatibilidade com a identidade rosa/branco e preto/rosa;
- comportamento em mouse, toque e teclado;
- custo de JavaScript, mídia e renderização;
- necessidade real de biblioteca externa;
- comportamento com movimento reduzido;
- licença e possibilidade de adaptação sem cópia indevida.

### 3. Propor antes de implementar

Apresente uma proposta curta contendo efeito, elemento, gatilho, duração aproximada, easing, comportamento em movimento reduzido e tecnologia prevista. Para uma nova interface ou mudança visual relevante, obtenha aprovação dentro do fluxo obrigatório de interface antes de editar a produção.

### 4. Escolher com moderação

Escolha somente os efeitos necessários ao fluxo atual. Uma referência marcada como `desejada` ainda precisa passar pelos critérios de acessibilidade, desempenho, segurança e coerência. Se duas animações competirem pela atenção, mantenha a que melhor comunica a ação principal.

### 5. Registrar a decisão

Acrescente uma entrada em **Registro de decisões dos agentes** com o formato:

```md
### AAAA-MM-DD — Superfície ou componente

- Agente responsável:
- Referências avaliadas:
- Decisão: escolhida | adaptada | descartada | adiada
- Efeito selecionado:
- Motivo:
- Tecnologia prevista ou usada:
- Movimento reduzido:
- Evidência de verificação:
- Riscos ou pendências:
```

### 6. Verificar

Antes de concluir uma implementação animada, verificar:

- fluxo completo com `prefers-reduced-motion: reduce`;
- navegação e foco visível por teclado;
- celular e desktop nos temas claro e escuro;
- ausência de layout shift e rolagem horizontal;
- ausência de erros e avisos relevantes no console;
- animação sem bloquear clique, toque ou resposta do servidor;
- carregamento e interação aceitáveis em dispositivo representativo;
- testes automatizados relevantes e verificação visual prevista pelo projeto.

## Registro de decisões dos agentes

Nenhuma decisão foi registrada ainda.
