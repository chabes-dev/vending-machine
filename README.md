# Prospecção

Página privada, mobile-first, para trabalhar a lista semanal de leads (salões e pet shops) direto do iPhone: abrir o WhatsApp com a mensagem pronta, copiar follow-ups, marcar status e anotar.

- **Next.js 16 (App Router)** na Vercel
- **Dados:** `data/leads.json` neste repo é a única fonte de verdade
- **Auth:** uma senha (`APP_PASSWORD`), cookie httpOnly de 30 dias

## Como funciona

```
iPhone ──> Vercel (Next.js) ──GitHub Contents API──> data/leads.json (este repo)
                                     ▲
         tarefa semanal do Claude ───┘ (git commit adicionando leads)
```

- A página **lê o `leads.json` do GitHub em tempo real** (não do bundle do deploy), então leads novos da tarefa semanal aparecem sem redeploy.
- Mudar status/notas chama `PATCH /api/leads/:id`, que re-lê o arquivo, aplica a mudança **só naquele lead** e commita com o `sha` lido. Se alguém commitou no meio (HTTP 409/422), repete em cima da versão nova — até 5 tentativas. Isso preserva leads adicionados pela tarefa semanal e edições de outros leads.
- `vercel.json` tem um `ignoreCommand` que **pula o build quando o commit só mexe em `data/leads.json`** — senão cada toque num status dispararia um deploy.
- Tocar em "Enviar no WhatsApp" num lead `new` já marca como `sent` automaticamente.
- Os contadores (enviados / respostas / calls / clientes) usam o `status_history`: um lead que foi `sent` e depois virou `no` continua contando como enviado. Eles respeitam os filtros de semana e categoria.
- Ao voltar para a aba (ex.: depois de enviar no WhatsApp), a lista é recarregada do GitHub.

## Formato de `data/leads.json`

Array de objetos:

| campo | tipo |
|---|---|
| `id` | string única (ex.: `2026-09-28-salao-studio-bella`) |
| `business_name`, `neighbourhood`, `address`, `google_maps_url` | string |
| `category` | `salao` \| `pet` |
| `whatsapp` | E.164 (`+5511999999999`) ou `null` |
| `instagram_url`, `website` | string ou `null` |
| `source_of_whatsapp` | `google` \| `site` \| `instagram` \| `not_found` |
| `week` | data ISO do lote (`2026-09-28`) |
| `messages` | `[msg1, msg2, msg3]` |
| `status` | `new` \| `sent` \| `replied` \| `call_booked` \| `client` \| `no` |
| `status_history` | `[{ "status": "...", "at": "ISO timestamp" }]` |
| `notes` | string |

**Regra para a tarefa semanal:** só *adicionar* leads novos no fim do array (com `status: "new"`), nunca reescrever os existentes — não mexer em `status`, `status_history` ou `notes` de leads que já estão lá. Use `id` único. O lote padrão exibido é o `week` mais recente.

## Setup

### 1. Token do GitHub (fine-grained)

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:

- **Resource owner:** dono do repo (`chabes-dev`)
- **Repository access:** *Only select repositories* → `vending-machine`
- **Permissions → Repository permissions → Contents: Read and write** (Metadata: Read-only é adicionada automaticamente)
- Nada mais.
- Expiração: escolha e anote — quando vencer, a página para de salvar (erro "Falha ao salvar no GitHub").

### 2. Variáveis de ambiente

| var | obrigatória | exemplo |
|---|---|---|
| `APP_PASSWORD` | sim | uma senha longa |
| `GITHUB_TOKEN` | sim (produção) | `github_pat_...` |
| `GITHUB_REPO` | não | `chabes-dev/vending-machine` (padrão) |
| `GITHUB_BRANCH` | não | `main` (padrão) — o branch onde o `leads.json` vive e a Vercel faz deploy de produção |

Trocar `APP_PASSWORD` desloga todos os aparelhos.

### 3. Deploy na Vercel

1. vercel.com → **Add New… → Project** → importe `chabes-dev/vending-machine`. Framework: Next.js (detectado). Sem mudanças no build.
2. Em **Environment Variables**, adicione as variáveis acima (ambiente *Production*; *Preview* também se quiser testar previews).
3. Deploy. Abra a URL no iPhone → Safari → Compartilhar → **Adicionar à Tela de Início** para abrir como app.
4. Opcional: em *Settings → Deployment Protection*, deixe a proteção da Vercel desligada para produção (a senha da própria página já protege; a proteção da Vercel exigiria login na Vercel no celular).

### 4. Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha APP_PASSWORD
npm run dev
```

Sem `GITHUB_TOKEN`, a app lê e grava o `data/leads.json` local (nada vai pro GitHub). Com o token, usa o repo/branch configurados.

## Limitações honestas

- Cada mudança de status/nota é um commit. O histórico do git vai ficar grande com o tempo; é o preço de usar o repo como banco.
- A API de Contents do GitHub tem limite de 5.000 req/h por token — muito longe do uso de uma pessoa.
- Se dois aparelhos editarem as **notas do mesmo lead** ao mesmo tempo, vale a última gravação.
