const fs = require("fs");
const path = require("path");
const { TEMP_DIR, OUTPUT_DIR, JOBS_DIR } = require("./config");
const { log, header, divider } = require("./logger");
const { download } = require("./downloader");
const { transcribe } = require("./transcriber");
const { cutVideos } = require("./cutter");
const {
  createJobDir,
  updateStatus,
  getStatus,
  listJobs,
  isAlreadyProcessed,
} = require("./jobManager");

const PROMPT_TEMPLATE = `Você é um editor de vídeo especialista em conteúdo viral para YouTube Shorts, TikTok e Reels.

Abaixo está a transcrição completa de um vídeo com timestamps. Sua tarefa é identificar os MELHORES trechos para serem transformados em shorts virais.

TRANSCRIÇÃO:
{{TRANSCRICAO}}

REGRAS:
- Selecione entre 3 e 5 trechos
- Cada trecho deve ter entre 20 e 45 segundos
- O trecho DEVE funcionar sozinho, sem depender do contexto do vídeo completo
- Priorize: ganchos fortes, frases impactantes, opiniões marcantes, dicas práticas, curiosidade, emoção
- Evite: trechos confusos, sem contexto, com pausas longas, ou que dependem do restante do vídeo
- Os timestamps de início e fim devem corresponder aos timestamps da transcrição
- Pode agrupar segmentos consecutivos para formar um trecho maior

IMPORTANTE: Retorne APENAS um JSON válido, sem markdown, sem explicações. O formato deve ser exatamente:

[
  {
    "inicio": "HH:MM:SS",
    "fim": "HH:MM:SS",
    "titulo": "Título curto e chamativo para o short"
  }
]`;

// ─── Comandos ────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  const validCommands = ["transcribe", "cut", "batch", "process-cuts", "status", "interactive"];

  if (!command || !validCommands.includes(command)) {
    console.log("Uso:");
    console.log('  node src/index.js transcribe "URL"     → Baixa e transcreve (único)');
    console.log("  node src/index.js cut                  → Corta shorts (único)");
    console.log("  node src/index.js batch videos.txt     → Processa fila de vídeos");
    console.log("  node src/index.js process-cuts         → Corta todos os jobs prontos");
    console.log("  node src/index.js status               → Mostra status de todos os jobs");
    console.log("  node src/index.js interactive          → Modo interativo com menu");
    process.exit(1);
  }

  if (command === "interactive") {
    // Lança o módulo ESM interativo
    await import("./interactive.mjs");
    return;
  }

  switch (command) {
    case "transcribe":
      await runTranscribe();
      break;
    case "cut":
      await runCut();
      break;
    case "batch":
      await runBatch();
      break;
    case "process-cuts":
      await runProcessCuts();
      break;
    case "status":
      runStatus();
      break;
  }
}

// ─── Transcribe (único) ──────────────────────────────────

async function runTranscribe() {
  const url = process.argv[3];
  if (!url) {
    console.log('Uso: node src/index.js transcribe "URL_DO_VIDEO"');
    process.exit(1);
  }

  header("GERADOR DE SHORTS - ETAPA 1: TRANSCRIÇÃO");
  log("INÍCIO", `URL: ${url}`);
  const startTime = Date.now();

  try {
    header("Baixando vídeo");
    const { videoPath, audioPath } = download(url);

    header("Transcrevendo com Whisper local");
    const { text } = transcribe(audioPath);

    const promptText = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", text);
    const promptPath = path.join(OUTPUT_DIR, "prompt_claude.txt");
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(promptPath, promptText, "utf-8");
    log("PROMPT", `Prompt salvo: ${promptPath}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    header("TRANSCRIÇÃO COMPLETA");
    log("FIM", `Concluído em ${elapsed}s`);
    showNextSteps();
  } catch (err) {
    log("ERRO", err.message);
    console.error(err);
    process.exit(1);
  }
}

// ─── Cut (único) ─────────────────────────────────────────

async function runCut() {
  header("GERADOR DE SHORTS - ETAPA 2: CORTE");

  const videoPath = path.join(TEMP_DIR, "video.mp4");
  const cutsPath = path.join(OUTPUT_DIR, "cortes.json");

  if (!fs.existsSync(videoPath)) {
    log("ERRO", "Vídeo não encontrado em temp/video.mp4");
    process.exit(1);
  }
  if (!fs.existsSync(cutsPath)) {
    log("ERRO", "Arquivo não encontrado: output/cortes.json");
    process.exit(1);
  }

  try {
    const cuts = parseCutsFile(cutsPath);
    header("Cortando vídeos com FFmpeg");
    const generatedFiles = cutVideos(videoPath, cuts);
    showCutResults(generatedFiles, OUTPUT_DIR);
  } catch (err) {
    log("ERRO", err.message);
    console.error(err);
    process.exit(1);
  }
}

// ─── Batch ───────────────────────────────────────────────

async function runBatch() {
  const filePath = process.argv[3];
  if (!filePath) {
    console.log("Uso: node src/index.js batch videos.txt");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    log("ERRO", `Arquivo não encontrado: ${absPath}`);
    process.exit(1);
  }

  const urls = fs
    .readFileSync(absPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (urls.length === 0) {
    log("ERRO", "Nenhum link encontrado no arquivo");
    process.exit(1);
  }

  header(`BATCH: ${urls.length} VÍDEOS NA FILA`);
  const startTime = Date.now();
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const progress = `[${i + 1}/${urls.length}]`;

    header(`${progress} Processando vídeo`);
    log("BATCH", `URL: ${url}`);

    // Cria job
    const { jobDir, slug, alreadyExists } = createJobDir(i + 1, url);

    // Pula se já foi processado
    if (alreadyExists && isAlreadyProcessed(jobDir)) {
      const status = getStatus(jobDir);
      log("BATCH", `Pulando ${slug} (status: ${status.status})`);
      skipCount++;
      continue;
    }

    try {
      updateStatus(jobDir, "baixando", url);

      // Download
      log("BATCH", `${progress} Baixando...`);
      const { videoPath, audioPath } = download(url, jobDir);

      // Transcrição
      updateStatus(jobDir, "transcrevendo");
      log("BATCH", `${progress} Transcrevendo...`);
      const { text } = transcribe(audioPath, jobDir);

      // Gera prompt
      const promptText = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", text);
      fs.writeFileSync(
        path.join(jobDir, "prompt_claude.txt"),
        promptText,
        "utf-8"
      );

      updateStatus(jobDir, "aguardando_cortes");
      log("BATCH", `${progress} Transcrição completa para: ${slug}`);
      successCount++;
    } catch (err) {
      updateStatus(jobDir, "erro");
      log("ERRO", `${progress} Falha em ${slug}: ${err.message}`);
      errorCount++;
    }
  }

  // Resumo final
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  header("BATCH COMPLETO");
  log("FIM", `Tempo total: ${elapsed} minutos`);
  log("FIM", `Sucesso: ${successCount} | Pulados: ${skipCount} | Erros: ${errorCount}`);
  divider();
  console.log("");
  console.log("  Próximos passos:");
  console.log("");
  console.log("  1. Abra cada pasta em jobs/ e copie o prompt_claude.txt pro Claude");
  console.log("  2. Salve o JSON de resposta como cortes.json na mesma pasta");
  console.log("  3. Rode: node src/index.js process-cuts");
  console.log("");
  console.log("  Ou veja o status: node src/index.js status");
  console.log("");
  divider();
}

// ─── Process Cuts ────────────────────────────────────────

async function runProcessCuts() {
  header("PROCESSANDO CORTES DE TODOS OS JOBS");

  const jobs = listJobs();
  if (jobs.length === 0) {
    log("ERRO", "Nenhum job encontrado em jobs/");
    process.exit(1);
  }

  let cutCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const job of jobs) {
    const cutsPath = path.join(job.dir, "cortes.json");
    const videoPath = path.join(job.dir, "video.mp4");
    const outputDir = path.join(job.dir, "output");

    // Pula jobs já finalizados
    if (job.status.status === "finalizado") {
      log("CORTES", `Pulando ${job.name} (já finalizado)`);
      skipCount++;
      continue;
    }

    // Pula se não tem cortes.json
    if (!fs.existsSync(cutsPath)) {
      log("CORTES", `Pulando ${job.name} (sem cortes.json)`);
      skipCount++;
      continue;
    }

    // Pula se não tem vídeo
    if (!fs.existsSync(videoPath)) {
      log("CORTES", `Pulando ${job.name} (sem video.mp4)`);
      skipCount++;
      continue;
    }

    header(`Cortando: ${job.name}`);

    try {
      updateStatus(job.dir, "cortando");
      const cuts = parseCutsFile(cutsPath);
      const generatedFiles = cutVideos(videoPath, cuts, outputDir);

      updateStatus(job.dir, "finalizado");
      log("CORTES", `${job.name}: ${generatedFiles.length} shorts gerados`);
      cutCount++;
    } catch (err) {
      updateStatus(job.dir, "erro");
      log("ERRO", `${job.name}: ${err.message}`);
      errorCount++;
    }
  }

  header("PROCESS-CUTS COMPLETO");
  log("FIM", `Cortados: ${cutCount} | Pulados: ${skipCount} | Erros: ${errorCount}`);
}

// ─── Status ──────────────────────────────────────────────

function runStatus() {
  header("STATUS DOS JOBS");

  const jobs = listJobs();
  if (jobs.length === 0) {
    log("STATUS", "Nenhum job encontrado");
    return;
  }

  const statusIcons = {
    criado: "[ ]",
    baixando: "[~]",
    transcrevendo: "[~]",
    aguardando_cortes: "[?]",
    cortando: "[~]",
    finalizado: "[V]",
    erro: "[X]",
  };

  for (const job of jobs) {
    const icon = statusIcons[job.status.status] || "[?]";
    const hasCuts = fs.existsSync(path.join(job.dir, "cortes.json"));
    const cutsNote =
      job.status.status === "aguardando_cortes" && hasCuts
        ? " (cortes.json encontrado!)"
        : "";
    console.log(`  ${icon} ${job.name} → ${job.status.status}${cutsNote}`);
  }

  divider();

  const aguardando = jobs.filter(
    (j) => j.status.status === "aguardando_cortes"
  );
  const comCortes = aguardando.filter((j) =>
    fs.existsSync(path.join(j.dir, "cortes.json"))
  );
  const finalizados = jobs.filter((j) => j.status.status === "finalizado");

  console.log(`  Total: ${jobs.length} jobs`);
  console.log(`  Aguardando cortes: ${aguardando.length}`);
  console.log(`  Prontos pra cortar: ${comCortes.length}`);
  console.log(`  Finalizados: ${finalizados.length}`);
  divider();
}

// ─── Helpers ─────────────────────────────────────────────

function parseCutsFile(cutsPath) {
  const raw = fs.readFileSync(cutsPath, "utf-8");
  let cuts;
  try {
    cuts = JSON.parse(raw);
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      cuts = JSON.parse(match[0]);
    } else {
      throw new Error(`JSON inválido em ${cutsPath}`);
    }
  }

  if (!Array.isArray(cuts) || cuts.length === 0) {
    throw new Error(`Nenhum corte encontrado em ${cutsPath}`);
  }

  for (const cut of cuts) {
    if (!cut.inicio || !cut.fim) {
      throw new Error(`Corte sem "inicio" ou "fim" em ${cutsPath}`);
    }
  }

  return cuts;
}

function showNextSteps() {
  divider();
  console.log("");
  console.log("  Próximos passos:");
  console.log("");
  console.log("  1. Abra o arquivo: output/prompt_claude.txt");
  console.log("  2. Copie TODO o conteúdo e cole no Claude (claude.ai)");
  console.log("  3. O Claude vai devolver um JSON com os cortes");
  console.log("  4. Salve esse JSON no arquivo: output/cortes.json");
  console.log("  5. Rode: node src/index.js cut");
  console.log("");
  divider();
}

function showCutResults(generatedFiles, outputDir) {
  header("CORTE COMPLETO");
  log("FIM", `${generatedFiles.length} shorts gerados!`);
  divider();
  for (const file of generatedFiles) {
    console.log(`  >> ${file.title}`);
    console.log(`     ${file.file}`);
    console.log();
  }
  divider();
  log("FIM", `Todos os shorts estão em: ${outputDir}`);
}

main();
