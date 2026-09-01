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

### Galeria contínua do portfólio

- Link: https://motion-primitives.com/docs/infinite-slider
- Site/componente: Motion Primitives — Infinite Slider vertical.
- Aplicar em: faixa de imagens do portfólio.
- O que gostei: velocidade que permite visualizar várias fotos.
- O que não copiar: movimento vertical no celular, reprodução sem controle e velocidade que dificulte observar cada trabalho.
- Intensidade: sutil.
- Prioridade: inspiração.
- Observações para celular: preferir direção horizontal com gesto manual; pausar em hover ou foco no desktop; em `prefers-reduced-motion`, apresentar galeria estática ou rolável sem autoplay.

### Entrada dos títulos do portfólio

- Link: https://motion-primitives.com/docs/text-effect
- Site/componente: Motion Primitives — Text Effect por palavra, linha ou caractere.
- Aplicar em: título da seção de portfólio e, com moderação, em outros títulos principais.
- O que gostei: entrada animada para títulos e textos curtos.
- O que não copiar: aplicar em todos os textos ou repetir a animação continuamente.
- Intensidade: moderada.
- Prioridade: desejada.
- Observações para celular: executar uma única vez, preferencialmente por palavra ou linha; em movimento reduzido, exibir o título imediatamente.

### Destaque textual do hero

- Link: https://motion-primitives.com/docs/text-scramble
- Site/componente: Motion Primitives — Text Scramble com caracteres e duração personalizados.
- Aplicar em: no máximo uma palavra curta ou chamada decorativa do hero.
- O que gostei: efeito visual marcante.
- O que não copiar: estética tecnológica excessiva, uso em textos informativos, nome de serviço, preço, data ou horário.
- Intensidade: chamativa.
- Prioridade: inspiração.
- Observações para celular: usar somente se continuar legível e terminar rapidamente; em movimento reduzido, mostrar o texto final sem embaralhamento.

### Comparação de antes e depois

- Link: https://motion-primitives.com/docs/image-comparison
- Site/componente: Motion Primitives — Image Comparison com opções de mola.
- Aplicar em: pares genuínos de fotos de antes e depois no portfólio.
- O que gostei: comparação controlada pela cliente.
- O que não copiar: comparação entre clientes ou enquadramentos diferentes, ativação somente por hover ou mola exagerada.
- Intensidade: chamativa.
- Prioridade: desejada.
- Observações para celular: manter a informação disponível por controle de arraste acessível, botões “Antes” e “Depois” ou imagens empilhadas; nunca remover o conteúdo. Usar somente imagens com consentimento e textos alternativos adequados.

### Indicador de progresso da página

- Link: https://motion-primitives.com/docs/scroll-progress
- Site/componente: Motion Primitives — Scroll Progress Gradient.
- Aplicar em: barra fina no topo de páginas realmente longas, possivelmente a página principal.
- O que gostei: indicação discreta de quanto conteúdo falta percorrer.
- O que não copiar: transparência sobre textos, espessura chamativa ou uso em páginas curtas e no fluxo de agendamento.
- Intensidade: sutil.
- Prioridade: opcional.
- Observações para celular: pode aparecer se não cobrir a navegação nem áreas seguras; ocultar quando não houver rolagem significativa e reduzir para estado estático com movimento reduzido.

### Galeria tridimensional vinculada à rolagem

- Link: https://motion.dev/examples/react-scroll-velocity-linked-offset
- Site/componente: Motion — Scroll velocity: 3D planes.
- Aplicar em: somente como inspiração para uma futura experiência editorial do portfólio.
- O que gostei: maneira diferenciada de apresentar imagens.
- O que não copiar: perspectiva que esconde os trabalhos, ondulação intensa, quantidade excessiva de imagens, texto embaralhado e dependência de conteúdo premium sem licença.
- Intensidade: chamativa.
- Prioridade: adiada.
- Observações para celular: não usar na primeira versão; preferir uma galeria simples, rápida e controlável. Uma futura adaptação precisará de teste específico de desempenho, toque, enjoo por movimento e movimento reduzido.

## Sugestões do arquiteto para avaliação

Estas referências não são escolhas automáticas. O agente de frontend deve apresentá-las à proprietária junto das referências aplicáveis antes de adotá-las.

### Transição entre etapas do agendamento

- Link: https://motion-primitives.com/docs/transition-panel
- Site/componente: Motion Primitives — Transition Panel.
- Aplicar em: transição entre serviço, profissional, data, horário e confirmação.
- Motivo da sugestão: ajuda a comunicar avanço e retorno entre etapas sem retirar o foco da tarefa principal.
- Limites: animação curta, direção coerente com avanço/retorno, altura estável e conteúdo imediatamente disponível com movimento reduzido.

### Entrada suave de seções e imagens

- Link: https://motion-primitives.com/docs/in-view
- Site/componente: Motion Primitives — In View.
- Aplicar em: serviços, benefícios e imagens do portfólio ao entrarem na área visível.
- Motivo da sugestão: acrescenta acabamento elegante e discreto, mais adequado a um salão do que movimento 3D intenso.
- Limites: executar uma vez, usar opacidade e pequeno deslocamento, não esconder conteúdo essencial e desativar o deslocamento com movimento reduzido.

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
