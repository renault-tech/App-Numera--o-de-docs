# 01 — Visão Geral do Produto

## 1. O problema

Em órgãos públicos (o contexto original é uma prefeitura), documentos oficiais
— ofícios, memorandos, portarias, decretos, resoluções, contratos, editais —
recebem numeração sequencial obrigatória. O controle tradicional é feito assim:

- Existe uma **folha de papel com números impressos** por tipo de documento;
- Quando alguém usa um número em um documento, **risca o número na folha**;
- Isso evita que dois documentos recebam o mesmo número.

Problemas desse processo manual:

| Problema | Consequência |
|---|---|
| A folha é única e física | Só uma pessoa consulta por vez; não funciona remoto |
| Riscar é falho | Números duplicados ou pulados por esquecimento |
| Não registra contexto | Não se sabe **quem** usou o número, **quando** e **para quê** |
| Busca impossível | Encontrar "o ofício sobre X de março" exige procurar nos arquivos físicos |
| Reset anual manual | Na virada do ano, alguém precisa lembrar de trocar a folha dos tipos que reiniciam |

## 2. A solução

Sistema web centralizado onde o usuário:

1. Faz login;
2. Escolhe o tipo de documento que vai produzir;
3. Clica em **"Reservar número"** e recebe o próximo número disponível — de forma
   **atômica e garantidamente única**, mesmo com vários usuários simultâneos;
4. Informa o **assunto/tema** do documento (para busca posterior);
5. O sistema registra tudo em **histórico auditável**.

## 3. Regras de negócio essenciais

Estas regras são o contrato do sistema. Qualquer implementação deve respeitá-las.

### RN-01 — Unicidade absoluta do número
Um número, dentro de um tipo de documento (e dentro de um ano, quando o tipo
reinicia anualmente), **nunca pode ser atribuído duas vezes**. Esta é a razão de
existir do sistema. Deve ser garantida **no banco de dados** (constraint +
operação atômica), não apenas na interface. Ver doc 03, seção "Reserva atômica".

### RN-02 — Modos de numeração configuráveis por tipo
- **Contínua**: o contador nunca reinicia (ex.: Processo, Protocolo).
- **Anual**: o contador volta ao número inicial em 1º de janeiro (ex.: Ofício,
  Memorando, Portaria). O número formatado inclui o ano: `Of. 015/2026`.
- Cada tipo tem: nome, prefixo, número inicial, modo (contínua/anual),
  padding de zeros (formato de exibição) e status ativo/inativo.

### RN-03 — Números reservados não são apagados
Reservas erradas são **anuladas** (status `cancelada`), nunca deletadas. O
número anulado fica registrado como anulado — o histórico permanece íntegro
para auditoria. Reutilizar um número anulado é decisão administrativa explícita
(funcionalidade futura, desabilitada por padrão).

### RN-04 — Permissões por usuário
- **Administrador**: acesso total (tipos, usuários, logs, configurações).
- **Usuário Completo**: reserva números de todos os tipos ativos.
- **Usuário Restrito**: reserva apenas dos tipos explicitamente permitidos.
- **Somente Leitura**: consulta histórico, não reserva.
- Novos cadastros nascem **pendentes de aprovação** por um administrador.

### RN-05 — Auditoria completa
Toda ação relevante (reserva, anulação, login, criação/edição de tipo ou
usuário, aprovação) gera log com: quem, o quê, quando e detalhes. Logs são
**imutáveis** (insert-only).

### RN-06 — Busca e verificação posterior
O histórico deve ser pesquisável por: **assunto/tema** (texto livre),
**número** (exato ou formatado), **tipo de documento**, **intervalo de datas**,
**usuário** e **secretaria/setor**.

### RN-07 — Contexto organizacional
Usuários pertencem a uma **secretaria** e **setor**, com **cargo**. Esses dados
são gravados na reserva (desnormalizados) para que o histórico reflita o
contexto do momento da reserva, mesmo que o usuário mude de setor depois.

## 4. Personas

| Persona | Descrição | Necessidades principais |
|---|---|---|
| **Servidor(a) que redige documentos** | Faz ofícios/memorandos diariamente | Reservar número em segundos, ver seus últimos números, buscar um número antigo |
| **Chefe de setor / secretário(a)** | Supervisiona a produção documental | Consultar o que o setor produziu, relatórios por período |
| **Administrador do sistema** | TI ou responsável administrativo | Gerenciar tipos, usuários e permissões; auditar logs; configurar reset anual |
| **Auditor / controle interno** | Verifica conformidade | Buscar por número/data/tema, confiar na integridade do histórico |

## 5. Casos de uso principais

### UC-01 — Reservar número
1. Usuário logado vê os tipos de documento que pode usar;
2. Seleciona o tipo → sistema exibe o próximo número disponível (informativo);
3. Preenche assunto/tema (obrigatório) e ementa (opcional);
4. Confirma → sistema executa a reserva atômica e exibe o número final obtido
   (que pode diferir do exibido, se outro usuário reservou no meio tempo);
5. Usuário copia o número formatado (botão "copiar") para colar no documento.

**Fluxo alternativo**: falha de rede → sistema informa claramente se a reserva
foi ou não efetivada (nunca deixar dúvida — em caso de incerteza, consultar o
histórico antes de tentar de novo).

### UC-02 — Buscar documento
Usuário abre "Histórico/Busca", filtra por texto, tipo, período, número e/ou
usuário; resultados paginados; pode exportar o resultado (PDF/Excel).

### UC-03 — Anular reserva
Usuário (dono da reserva, mesmo dia) ou admin (qualquer) anula uma reserva
informando o motivo; reserva muda para status `cancelada`; log é gerado.

### UC-04 — Gerenciar tipos de documento (admin)
Criar/editar tipo: nome, prefixo, formato, número inicial, modo anual/contínua,
ativo/inativo. Alterar o "próximo número" manualmente exige confirmação e gera
log (caso de migração de numeração antiga em papel).

### UC-05 — Gerenciar usuários (admin)
Aprovar cadastros pendentes, definir nível de permissão, restringir tipos de
documento, desativar usuário (nunca deletar quem tem reservas).

### UC-06 — Virada de ano
Em 1º de janeiro, tipos com modo anual voltam ao número inicial
**automaticamente e no servidor** (não depender de alguém abrir o app). Ver doc 03.

## 6. O que o sistema NÃO é (escopo negativo)

- Não é um editor/gerador de documentos (não redige o ofício em si);
- Não é um protocolo/tramitação de processos (não acompanha o documento após numerado);
- Não é um GED/arquivo digital (não armazena o PDF do documento — embora anexar
  seja um item de backlog futuro, doc 07).

Manter esse foco é o que torna o sistema simples, rápido e adotável.

## 7. Métricas de sucesso

- **Zero números duplicados** (verificável por query no banco);
- Reserva completa em **menos de 10 segundos** do login ao número copiado;
- Adoção: setores abandonam a folha de papel;
- Qualquer documento localizável na busca em **menos de 30 segundos**.
