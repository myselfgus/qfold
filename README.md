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
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "primaryTextColor": "#FFFFFF",
    "primaryBorderColor": "#4F46E5",
    "lineColor": "#06B6D4",
    "secondaryColor": "#0F172A",
    "tertiaryColor": "#1E2937",
    "noteBkgColor": "#1E2937",
    "noteTextColor": "#E0F2FE",
    "edgeLabelBackground": "#0F172A"
  }
}}%%
graph TD
    subgraph Client ["🖥️ Cliente / Dispositivo"]
        A["🔐 Browser + WebAuthn + PRF"]
    end

    subgraph Edge ["☁️ Cloudflare Edge"]
        B["🚦 Dispatcher Worker<br/>OIDC + Routing"]
        C["🧠 Qfold Agent DO<br/>por usuário"]
        D["🛡️ Outbound Worker<br/>Egress Control"]
    end

    subgraph Storage ["💾 Storage por Qfold"]
        E["🗄️ SQLite (DO local)"]
        F["📦 R2 Assets / Backups"]
        G["🔑 KV Sessions"]
        H["📊 D1 Audit + Shared"]
    end

    subgraph External ["🌐 Serviços Externos"]
        I["🤖 OpenAI / Anthropic / MCP Servers"]
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
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "primaryTextColor": "#FFFFFF",
    "primaryBorderColor": "#4F46E5",
    "lineColor": "#06B6D4",
    "secondaryColor": "#0F172A",
    "tertiaryColor": "#1E2937"
  }
}}%%
flowchart TB
    subgraph Client ["🖥️ Cliente"]
        WebAuthn["🔐 WebAuthn + PRF"]
    end

    subgraph Edge ["☁️ Qfold Edge"]
        Dispatcher["🚦 Dispatcher<br/>Qfold"]
        Agent["🧠 Qfold Agent DO"]
        Outbound["🛡️ Outbound<br/>Egress"]
    end

    subgraph Storage ["💾 Armazenamento"]
        StorageNode["SQLite + R2 + KV"]
    end

    WebAuthn --> Dispatcher
    Dispatcher --> Agent
    Agent --> Outbound
    Outbound --> External["🌐 External MCP / APIs"]
    Agent -.-> StorageNode
```

### Fluxo de Provisionamento Qfold (Estilizado)

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "primaryTextColor": "#FFFFFF",
    "lineColor": "#06B6D4",
    "secondaryColor": "#8B5CF6"
  }
}}%%
sequenceDiagram
    autonumber
    participant User as 👤 Usuário
    participant Dispatcher as 🚦 Dispatcher
    participant DO as 🧠 Qfold Agent DO

    User->>Dispatcher: /webauthn/register (PRF)
    Dispatcher->>DO: Create named DO + store PRF
    DO->>DO: Derive Master Key (HKDF)
    DO-->>Dispatcher: Qfold ID + pairwise_sub
    Dispatcher-->>User: Identity ready
```

### Fluxo OIDC com Pairwise Subject (Privacidade)

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "lineColor": "#06B6D4",
    "noteBkgColor": "#1E2937"
  }
}}%%
sequenceDiagram
    participant RP as "🏢 Relying Party (SaaS)"
    participant U as 👤 Usuário
    participant D as 🚦 Dispatcher
    participant DO as 🧠 Qfold Agent

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
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#10B981",
    "lineColor": "#06B6D4",
    "secondaryColor": "#EF4444"
  }
}}%%
flowchart LR
    A["🧠 Qfold Agent DO"] -->|safe_egress_fetch| B["🚦 Dispatcher"]
    B -->|env.OUTBOUND.fetch| C["🛡️ Outbound Worker"]
    C -->|1. SSRF Guard ❌| C
    C -->|2. Allow-list + Sanitize 🧼| C
    C -->|3. Dispatch tag 🏷️| D["🌐 External API"]
    D -->|Resposta sanitizada| C --> A
```

---

## Benefícios, Vantagens e Inovações do Qfold

### Comparação: Autenticação Tradicional vs Qfold

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "primaryTextColor": "#FFFFFF",
    "lineColor": "#06B6D4",
    "secondaryColor": "#EF4444",
    "tertiaryColor": "#10B981"
  }
}}%%
flowchart LR
    subgraph Tradicional ["❌ Tradicional (Senha / OAuth Centralizado)"]
        T1["🔓 Senhas ou tokens centrais"]
        T2["📊 Dados replicados em múltiplos SaaS"]
        T3["💸 Alto custo de infraestrutura"]
        T4["🕵️ Tracking cross-site possível"]
        T5["😴 Sem hibernação nativa"]
    end

    subgraph Qfold ["✅ Qfold (User-as-Agent)"]
        Q1["🔐 Chaves derivadas no dispositivo (PRF)"]
        Q2["🔒 Identidade pairwise (zero correlation)"]
        Q3["💰 Custo marginal zero (hibernação)"]
        Q4["🛡️ Zero-Knowledge + Egress Control"]
        Q5["🧠 Agente MCP com memória própria"]
    end

    Tradicional -->|vs| Qfold
```

### Principais Benefícios

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#10B981",
    "primaryTextColor": "#FFFFFF",
    "lineColor": "#06B6D4"
  }
}}%%
flowchart TD
    subgraph Privacidade ["🔒 Privacidade & Segurança"]
        B1["Zero-Knowledge<br/>Chaves nunca saem do dispositivo"]
        B2["Pairwise Subjects<br/>Impossível rastrear entre plataformas"]
        B3["Outbound Control<br/>SSRF + allow-list + sanitização"]
    end

    subgraph Eficiencia ["⚡ Eficiência & Escala"]
        B4["Hibernação Nativa<br/>Custo ~0 quando ocioso"]
        B5["Edge Global<br/>Latência mínima em qualquer lugar"]
        B6["Isolamento por DO<br/>Cada usuário = ambiente próprio"]
    end

    subgraph Inovacao ["🚀 Inovação"]
        B7["User = Agent<br/>Cada identidade é um agente vivo"]
        B8["MCP + ACP Nativo<br/>Ferramentas e comunicação entre agentes"]
        B9["Self-Sovereign IdP<br/>Você é seu próprio provedor de identidade"]
    end

    Privacidade --> Eficiencia
    Eficiencia --> Inovacao
```

### Vantagens Competitivas

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#8B5CF6",
    "lineColor": "#06B6D4",
    "tertiaryColor": "#F59E0B"
  }
}}%%
mindmap
  root((Qfold))
    Privacidade
      Pairwise por domínio
      Zero-Knowledge real
      Sem dados centralizados
    Performance
      Hibernação automática
      Edge em todo o mundo
      SQLite local por usuário
    Inovação
      Agente = Identidade
      MCP tools integrados
      Self-sovereign IdP
    Custo
      Quase zero quando ocioso
      Sem servidores sempre ligados
      Escala infinita na Cloudflare
```

### Inovações Técnicas

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "lineColor": "#06B6D4",
    "secondaryColor": "#8B5CF6"
  }
}}%%
flowchart TD
    Layer1["🧬 Camada de Identidade<br/>WebAuthn PRF + Derivação de Chaves"]
    Layer2["🧠 Camada de Agente<br/>McpAgent + SQLite + Hibernação"]
    Layer3["🔗 Camada de Comunicação<br/>MCP + ACP + OIDC Pairwise"]
    Layer4["🛡️ Camada de Proteção<br/>Outbound Worker + Egress Control"]
    Layer5["☁️ Camada de Infra<br/>Durable Objects + Workers for Platforms"]

    Layer1 --> Layer2
    Layer2 --> Layer3
    Layer3 --> Layer4
    Layer4 --> Layer5

    style Layer1 fill:#6366F1,color:#fff
    style Layer2 fill:#8B5CF6,color:#fff
    style Layer3 fill:#06B6D4,color:#0F172A
    style Layer4 fill:#10B981,color:#fff
    style Layer5 fill:#0F172A,color:#fff
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
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "lineColor": "#10B981",
    "secondaryColor": "#8B5CF6"
  }
}}%%
sequenceDiagram
    participant Client as 👤 Cliente
    participant DO as "🧠 Qfold Agent"
    participant OB as "🛡️ Outbound Worker"

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

### Ciclo de Vida do Qfold Agent DO

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#6366F1",
    "lineColor": "#06B6D4",
    "secondaryColor": "#10B981"
  }
}}%%
stateDiagram-v2
    [*] --> Created: 🆕 provision + WebAuthn PRF
    Created --> Active: 📥 recebe requisição
    Active --> Processing: ⚙️ MCP tool / OIDC
    Processing --> Hibernating: 😴 sem requisições
    Hibernating --> Active: ⏰ alarm ou nova requisição
    Active --> [*]: "♾️ (nunca morre)"
```

### Fluxo de Autenticação Completo

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#8B5CF6",
    "lineColor": "#06B6D4",
    "tertiaryColor": "#10B981"
  }
}}%%
flowchart TD
    Start["🏢 RP solicita login"] --> Challenge["🔐 WebAuthn Challenge"]
    Challenge --> PRF["📱 Dispositivo avalia PRF"]
    PRF --> Derive["🔑 Deriva master key no cliente"]
    Derive --> Token["🎟️ Dispatcher emite JWT pairwise"]
    Token --> RP["✅ RP recebe ID Token"]
    RP --> DO["🧠 Chama /mcp do Qfold"]
    DO -->|safe_egress| Outbound["🛡️ Outbound"]
    Outbound --> External["🌐 API externa"]
```

---

### Vantagens Visuais em Resumo

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#10B981",
    "primaryTextColor": "#FFFFFF",
    "lineColor": "#6366F1",
    "secondaryColor": "#8B5CF6"
  }
}}%%
flowchart TD
    subgraph Priv ["🔒 Privacidade"]
        P1["Zero Knowledge"]
        P2["Pairwise ID"]
    end

    subgraph Perf ["⚡ Performance"]
        Pe1["Hibernação"]
        Pe2["Edge Global"]
    end

    subgraph Ino ["🚀 Inovação"]
        I1["User = Agent"]
        I2["MCP Nativo"]
    end

    subgraph Custo ["💰 Custo"]
        C1["~0 quando ocioso"]
        C2["Sem servidores 24/7"]
    end

    Priv --> Perf
    Perf --> Ino
    Ino --> Custo
```

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
