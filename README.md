# Qfold — Identidade Federada AI-Native na Cloudflare

<p align="center">
  <img src="qfold.PNG" alt="Qfold Logo" width="420" />
</p>

<p align="center">
  <a href="https://developers.cloudflare.com/workers/"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Workers"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/"><img src="https://img.shields.io/badge/GitHub-Ready-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"></a>
  <img src="https://img.shields.io/badge/Qfold-Identity%20Platform-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMkM2LjQ4IDIgMiA2LjQ4IDIgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnoiIGZpbGw9IiM2MzY2ZjEiLz48L3N2Zz4=" alt="Qfold">
</p>

> **Cada usuário = um agente vivo, isolado e soberano.**

Sistema de identidade universal baseado em **Cloudflare Workers + Durable Objects**, implementando o paradigma **User-as-Agent** descrito na arquitetura "Arquitetura de Sistemas Nativos de Inteligência Artificial".

## Status de Produção (Julho 2026)

**Deployed e funcionando:**

- **Main Worker**: https://qfold.voither.workers.dev
- **Outbound Worker** (egress seguro): https://qfold-outbound.voither.workers.dev

Recursos provisionados:
- KV Namespaces (Sessions, Profiles, Rate Limits)
- R2 Buckets (qfold-assets, qfold-backups)
- D1 Databases (qfold-db + qfold-audit) com schema aplicado
- Durable Objects (McpAgent + UserDurableObject)
- Service Binding para Outbound
- JWT Secret configurado

> **Atenção**: Workers for Platforms (Dispatch Namespace em modo untrusted) ainda não está habilitado na conta. O sistema atualmente usa **named Durable Objects** como principal mecanismo de isolamento por usuário.

---

## Visão Geral da Arquitetura

O sistema transforma cada identidade registrada em um **Qfold Identity**: um agente computacional autônomo, com sua própria memória (SQLite + R2), chaves criptográficas derivadas via WebAuthn PRF, e capacidade de atuar como seu próprio Identity Provider (OIDC) de forma pairwise.

### Diagrama de Componentes (Alto Nível)

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#6366f1", "primaryTextColor": "#ffffff", "primaryBorderColor": "#4f46e5", "lineColor": "#22d3ee", "secondaryColor": "#0f172a", "tertiaryColor": "#1e2937"}}}%%
graph TD
    subgraph "Cliente / Dispositivo"
        A[Browser + WebAuthn + PRF]
    end

    subgraph "Cloudflare Edge"
        B[Dispatcher Worker<br/>OIDC + Routing]
        C[McpAgent DO<br/>por usuário]
        D[Outbound Worker<br/>Egress Control]
    end

    subgraph "Storage por Qfold"
        E[SQLite (DO local)]
        F[R2 Assets / Backups]
        G[KV Sessions]
        H[D1 Audit + Shared]
    end

    subgraph "Serviços Externos"
        I[OpenAI / Anthropic / MCP Servers]
    end

    A -->|WebAuthn + PRF| B
    B -->|Pairwise OIDC| C
    B -->|named DO| C
    C -->|Ferramentas MCP| D
    D -->|Sanitizado + Allowlist| I
    C --> E
    C --> F
    B --> G
    C --> H
```

### Arquitetura com Cores da Marca Qfold

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#6366f1", "primaryTextColor": "#fff", "lineColor": "#a855f7", "secondaryColor": "#22d3ee"}}}%%
flowchart TB
    subgraph Client ["Cliente"]
        WebAuthn["WebAuthn + PRF"]
    end

    subgraph Edge ["Qfold Edge"]
        Dispatcher["Dispatcher<br/>Qfold"]
        Agent["McpAgent DO"]
        Outbound["Outbound<br/>Egress"]
    end

    WebAuthn --> Dispatcher
    Dispatcher --> Agent
    Agent --> Outbound
    Outbound --> External["External MCP / APIs"]
    Agent -.->|SQLite| Storage["Qfold Storage"]
```

### Fluxo de Provisionamento Qfold (Estilizado)

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#6366f1", "primaryBorderColor": "#22d3ee", "lineColor": "#a855f7"}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Dispatcher
    participant DO as Qfold Agent DO

    User->>Dispatcher: /webauthn/register (PRF)
    Dispatcher->>DO: Create named DO + store PRF
    DO->>DO: Derive Master Key (HKDF)
    DO-->>Dispatcher: Qfold ID + pairwise_sub
    Dispatcher-->>User: Identity ready
```

### Fluxo Completo de Registro (WebAuthn + Criação do Twin)

```mermaid
sequenceDiagram
    participant U as Usuário (Browser)
    participant D as Dispatcher
    participant DO as McpAgent DO
    participant O as Outbound (opcional)

    U->>U: Gera credencial WebAuthn + PRF (Secure Enclave)
    U->>D: POST /webauthn/challenge
    D-->>U: Challenge
    U->>D: POST /webauthn/register + credentialId + PRF output
    D->>DO: provisionTwinUser + armazena PRF
    DO->>DO: Deriva master key (HKDF) + cria SQLite
    DO-->>D: pairwise_sub criado
    D-->>U: Identidade ativa (pairwise_sub)
```

### Fluxo OIDC com Pairwise Subject (Privacidade)

```mermaid
sequenceDiagram
    participant RP as Relying Party (SaaS)
    participant U as Usuário
    participant D as Dispatcher
    participant DO as McpAgent (Qfold)

    RP->>U: Inicia login com sua identidade
    U->>D: /authorize + PKCE
    D->>U: Redireciona para WebAuthn (se necessário)
    U->>D: /token
    D->>DO: Valida + emite JWT
    DO-->>D: Assina com chave derivada
    D-->>RP: ID Token com sub=pairwise_xxx (único por RP)
    Note over D,RP: Mesmo usuário → sub diferente por domínio
```

### Controle de Egress (Outbound Worker)

```mermaid
flowchart LR
    A[McpAgent DO] -->|safe_egress_fetch ou tool| B[Dispatcher]
    B -->|env.OUTBOUND.fetch| C[Outbound Worker]
    C -->|1. SSRF Guard| C
    C -->|2. Allow-list + Sanitize| C
    C -->|3. Dispatch tag| D[External API]
    D -->|Resposta sanitizada| C --> A
```

---

## Workflows Principais

### 1. Registro de Nova Identidade

1. Cliente chama `/webauthn/challenge`
2. Dispositivo gera passkey + avalia extensão PRF
3. Cliente envia para `/webauthn/register`
4. Sistema cria McpAgent DO nomeado
5. Deriva chave mestra (nunca sai do dispositivo + DO)
6. Retorna `pairwise_sub`

### 2. Autenticação em Terceiros (OIDC)

1. Terceiro redireciona para `/authorize`
2. Dispatcher valida via WebAuthn (se necessário)
3. Emite JWT com `sub` calculado deterministicamente por `userId + sector`
4. `sub` é sempre diferente por Relying Party

### 3. Execução de Ferramentas pelo Agente (MCP + Egress Seguro)

```mermaid
sequenceDiagram
    participant Client
    participant DO as McpAgent
    participant OB as Outbound Worker

    Client->>DO: MCP tool: safe_egress_fetch
    DO->>DO: Valida + prepara request
    DO->>OB: fetch via service binding
    OB->>OB: Bloqueia SSRF / checa allowlist / remove headers sensíveis
    OB->>External: Requisição limpa
    External-->>OB: Resposta
    OB-->>DO: Resposta sanitizada
    DO-->>Client: Resultado
```

### 4. Hibernação e Estado

- Durable Object hiberna automaticamente após inatividade.
- `alarm()` limpa sessões expiradas.
- Estado persistido em SQLite local do DO + R2.

---

## Stack Tecnológico

- **Runtime**: Cloudflare Workers (V8 Isolates)
- **State**: Durable Objects + SqlStorage (SQLite)
- **Storage**: KV, R2, D1
- **OIDC**: Implementação manual + suporte a PKCE + pairwise
- **MCP**: @modelcontextprotocol/sdk (Streamable HTTP)
- **Crypto**: Web Crypto API (AES-GCM, HKDF, HMAC)
- **Linguagem**: TypeScript

---

## Estrutura do Projeto

```
qfold/
├── src/
│   ├── index.ts                 # Dispatcher + OIDC endpoints + routing
│   ├── McpAgent.ts              # Agente principal (DO + MCP tools + crypto)
│   ├── outbound-worker.ts       # Egress seguro
│   ├── durable/UserDurableObject.ts
│   ├── utils/
│   │   ├── crypto.ts            # signJWT, AES-GCM, derive PRF
│   │   ├── pairwise.ts
│   │   ├── identity.ts          # provision
│   │   └── d1.ts                # audit + schema
│   └── types.ts
├── d1-migrations/
├── migrations/                  # Para wrangler d1
├── scripts/
│   └── create-cloudflare-resources.sh
├── wrangler.jsonc               # Config produção
├── wrangler.outbound.jsonc
├── DEPLOY.md
└── README.md
```

---

## Como Começar (Desenvolvimento Local)

```bash
npm install

# Dev
npm run dev

# Typecheck
npm run typecheck
```

### Criar Recursos no Cloudflare

```bash
./scripts/create-cloudflare-resources.sh production

# Depois preencha os IDs reais no wrangler.jsonc
```

### Aplicar Migrations

```bash
npm run d1:migrate:prod
npm run d1:migrate:audit:prod
```

### Deploy

```bash
npm run deploy
```

---

## Segurança e Princípios

- **Zero-Knowledge**: Chave mestra derivada no dispositivo via WebAuthn PRF. Cloudflare nunca vê a chave.
- **Pairwise Subjects**: Impossível correlacionar identidade entre diferentes SaaS.
- **Egress Control**: Todo tráfego externo passa pelo Outbound Worker (SSRF + allow-list + remoção de headers sensíveis).
- **Isolamento**: Cada Qfold tem seu próprio Durable Object + SQLite.
- **Hibernação**: Custo marginal zero quando o agente está ocioso.

---

## Diagramas Adicionais

### Ciclo de Vida do McpAgent DO

```mermaid
stateDiagram-v2
    [*] --> Created: provision + WebAuthn PRF
    Created --> Active: recebe requisição
    Active --> Processing: MCP tool / OIDC
    Processing --> Hibernating: sem requisições
    Hibernating --> Active: alarm ou nova requisição
    Active --> [*]: (nunca morre)
```

### Fluxo de Autenticação Completo

```mermaid
flowchart TD
    Start[RP solicita login] --> Challenge[WebAuthn Challenge]
    Challenge --> PRF[Dispositivo avalia PRF]
    PRF --> Derive[Deriva master key no cliente]
    Derive --> Token[Dispatcher emite JWT pairwise]
    Token --> RP[RP recebe ID Token]
    RP --> DO[Chama /mcp do Qfold]
    DO -->|safe_egress| Outbound
    Outbound --> External[API externa]
```

---

## Próximos Passos / Roadmap

- [ ] Habilitar Workers for Platforms + Dispatch Namespace real
- [ ] Suporte completo a `workers-oauth-provider`
- [ ] Custom domain + rota `identity.qfold.com`
- [ ] Mais ferramentas MCP (RAG local, memory tools, ACP real)
- [ ] UI de gerenciamento de identidades
- [ ] Testes de integração + load test com hibernação
- [ ] Documentação de como usar como IdP em outros SaaS

---

## Referências

- Arquitetura original: `Arquitetura Identidade Cloudflare AI.pdf`
- Cloudflare Durable Objects
- Model Context Protocol (MCP)
- WebAuthn PRF Extension
- OpenID Connect Pairwise Identifiers

---

**Construído com ❤️ seguindo o paradigma de identidade soberana e agentes nativos na edge.**

Se quiser contribuir ou testar, abra uma issue ou PR.
