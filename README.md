# Shorts Generator CLI

Backend em Node.js que transforma vídeos longos do YouTube em shorts prontos para publicação. Usa Whisper local para transcrição (custo zero), Claude para análise dos melhores trechos e FFmpeg para corte automático.

## Funcionalidades

- **Transcrição automática** com Whisper local (sem API paga)
- **Geração de prompt** pronto para colar no Claude
- **Corte automático** dos vídeos com FFmpeg
- **Processamento em lote** (batch) com múltiplos vídeos
- **Organização por jobs** com pastas e status independentes
- **Modo interativo** com menu guiado no terminal
- **Logs claros** com progresso em cada etapa

## Tecnologias

| Ferramenta | Função |
|---|---|
| **Node.js** | Orquestração do pipeline |
| **Python + Whisper** | Transcrição de áudio com timestamps |
| **FFmpeg** | Extração de áudio e corte de vídeo |
| **yt-dlp** | Download de vídeos do YouTube |
| **Claude (manual)** | Análise e seleção dos melhores trechos |

## Pré-requisitos

Certifique-se de ter tudo instalado antes de começar:

```bash
# Node.js (v18+)
node --version

# Python (v3.8+)
python --version

# FFmpeg
ffmpeg -version

# yt-dlp
yt-dlp --version
```

Se faltar algo:

- **Node.js**: https://nodejs.org
- **Python**: https://python.org
- **FFmpeg**: https://ffmpeg.org/download.html (ou `choco install ffmpeg` no Windows)
- **yt-dlp**: `pip install yt-dlp`

## Instalação

```bash
# 1. Clone o projeto
git clone <url-do-repositorio>
cd shortsClaude

# 2. Instale as dependências Node
npm install

# 3. Instale o Whisper local
pip install openai-whisper
```

Pronto. Sem API keys, sem `.env`, sem configuração adicional.

## Como usar

### Modo simples (1 vídeo)

**Passo 1 — Transcrever:**

```bash
node src/index.js transcribe "https://www.youtube.com/watch?v=VIDEO_ID"
```

O sistema vai:
- Baixar o vídeo
- Extrair o áudio
- Transcrever com Whisper local
- Gerar `output/transcricao.txt` e `output/prompt_claude.txt`

**Passo 2 — Analisar com Claude:**

1. Abra `output/prompt_claude.txt`
2. Copie todo o conteúdo
3. Cole no [Claude](https://claude.ai) (chat)
4. O Claude retorna um JSON com os cortes
5. Salve esse JSON em `output/cortes.json`

**Passo 3 — Cortar:**

```bash
node src/index.js cut
```

Os shorts são salvos em `output/`.

---

### Modo batch (vários vídeos)

**Passo 1 — Crie o arquivo de links:**

Edite `videos.txt` na raiz do projeto:

```
# Um link por linha (linhas com # são ignoradas)
https://www.youtube.com/watch?v=VIDEO_1
https://www.youtube.com/watch?v=VIDEO_2
https://www.youtube.com/watch?v=VIDEO_3
```

**Passo 2 — Processe a fila:**

```bash
node src/index.js batch videos.txt
```

O sistema cria uma pasta para cada vídeo em `jobs/`, baixa e transcreve cada um automaticamente.

**Passo 3 — Analise com Claude:**

Para cada job em `jobs/`:
1. Abra o `prompt_claude.txt` da pasta
2. Cole no Claude
3. Salve a resposta como `cortes.json` na mesma pasta

**Passo 4 — Corte todos de uma vez:**

```bash
node src/index.js process-cuts
```

**Passo 5 — Acompanhe o status:**

```bash
node src/index.js status
```

---

### Modo interativo

```bash
npm run dev
```

Abre um menu guiado no terminal com todas as opções acima.

## Todos os comandos

| Comando | Descrição |
|---|---|
| `node src/index.js transcribe "URL"` | Baixa e transcreve um vídeo |
| `node src/index.js cut` | Corta shorts do `output/cortes.json` |
| `node src/index.js batch videos.txt` | Processa fila de vídeos |
| `node src/index.js process-cuts` | Corta todos os jobs com `cortes.json` |
| `node src/index.js status` | Mostra status de todos os jobs |
| `node src/index.js interactive` | Modo interativo com menu |
| `npm run dev` | Atalho para o modo interativo |

## Estrutura do projeto

```
shortsClaude/
├── src/
│   ├── index.js            # CLI principal com todos os comandos
│   ├── interactive.mjs     # Modo interativo (menu no terminal)
│   ├── config.js           # Configuração de paths
│   ├── logger.js           # Logs formatados
│   ├── downloader.js       # Download via yt-dlp + extração de áudio
│   ├── transcriber.js      # Transcrição via Whisper local
│   ├── cutter.js           # Corte de vídeo via FFmpeg
│   └── jobManager.js       # Gerenciamento de jobs (batch)
├── scripts/
│   └── whisper_transcribe.py  # Script Python do Whisper
├── jobs/                   # Pastas de jobs (batch)
├── output/                 # Saída do modo simples
├── temp/                   # Arquivos temporários
├── videos.txt              # Lista de links para batch
├── package.json
└── README.md
```

## Estrutura de um job

Cada vídeo processado em batch gera uma pasta em `jobs/`:

```
jobs/001_VIDEO_ID/
├── input.txt           # Link original do vídeo
├── video.mp4           # Vídeo baixado
├── audio.mp3           # Áudio extraído
├── transcricao.txt     # Transcrição com timestamps
├── prompt_claude.txt   # Prompt pronto para o Claude
├── cortes.json         # JSON de cortes (preenchido pelo usuário)
├── status.json         # Status do job (automático)
└── output/             # Shorts gerados
    ├── short_01_titulo.mp4
    ├── short_02_titulo.mp4
    └── ...
```

O `status.json` acompanha o progresso:

```json
{
  "status": "aguardando_cortes",
  "videoUrl": "https://...",
  "createdAt": "2026-03-23T...",
  "updatedAt": "2026-03-23T..."
}
```

Status possíveis: `criado` → `baixando` → `transcrevendo` → `aguardando_cortes` → `cortando` → `finalizado` (ou `erro`).

## Exemplo de cortes.json

Este é o formato que o Claude retorna e que o sistema espera:

```json
[
  {
    "inicio": "00:01:12",
    "fim": "00:01:39",
    "titulo": "O erro que destrói sua produtividade"
  },
  {
    "inicio": "00:05:30",
    "fim": "00:06:02",
    "titulo": "A técnica que mudou minha rotina"
  },
  {
    "inicio": "00:12:45",
    "fim": "00:13:18",
    "titulo": "Por que ninguém fala sobre isso"
  }
]
```

Campos obrigatórios: `inicio`, `fim`. O campo `titulo` é usado no nome do arquivo de saída.

## Fluxo completo resumido

```
Link YouTube
    ↓
yt-dlp (download)
    ↓
FFmpeg (extrai áudio)
    ↓
Whisper local (transcrição)
    ↓
Prompt gerado automaticamente
    ↓
Claude (análise manual) → JSON de cortes
    ↓
FFmpeg (corta os trechos)
    ↓
Shorts prontos em output/
```

## Erros e logs

- Cada etapa exibe logs no terminal com timestamp e nome da etapa
- No modo batch, se um vídeo falhar, o sistema continua com o próximo
- Jobs com erro ficam marcados como `erro` no `status.json`
- Rodar batch novamente pula vídeos já processados

## Limitações atuais

- Fluxo semi-manual (análise feita no Claude via chat)
- Sem interface gráfica (tudo via terminal)
- Whisper roda em CPU (pode demorar ~1 min por minuto de áudio)
- Shorts gerados em formato horizontal (16:9)

## Melhorias futuras

- Integração direta com Claude API (fluxo 100% automático)
- Corte em formato vertical (9:16) para Shorts/Reels/TikTok
- Legendas automáticas sobrepostas no vídeo
- Interface web para gerenciar jobs
- Processamento paralelo de múltiplos vídeos
- Suporte a outras plataformas além do YouTube

## Licença

MIT
