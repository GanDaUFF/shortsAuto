import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fs = require("fs");
const path = require("path");
const { TEMP_DIR, OUTPUT_DIR, JOBS_DIR, SCRIPTS_DIR } = require("./config.js");
const { log, header, divider } = require("./logger.js");
const { download } = require("./downloader.js");
const { transcribe } = require("./transcriber.js");
const { cutVideos } = require("./cutter.js");
const {
  createJobDir,
  updateStatus,
  getStatus,
  listJobs,
  isAlreadyProcessed,
} = require("./jobManager.js");

// ─── Prompt template ─────────────────────────────────────

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

// ─── UI Helpers ──────────────────────────────────────────

function banner() {
  console.log("");
  console.log(
    chalk.cyan.bold(
      "  ╔══════════════════════════════════════════════════╗"
    )
  );
  console.log(
    chalk.cyan.bold(
      "  ║         SHORTS GENERATOR - Modo Interativo      ║"
    )
  );
  console.log(
    chalk.cyan.bold(
      "  ╚══════════════════════════════════════════════════╝"
    )
  );
  console.log("");
}

function sectionTitle(text) {
  console.log("");
  console.log(chalk.yellow.bold(`  ▸ ${text}`));
  console.log(chalk.gray("  " + "─".repeat(50)));
}

function success(text) {
  console.log(chalk.green.bold(`  ✔ ${text}`));
}

function error(text) {
  console.log(chalk.red.bold(`  ✖ ${text}`));
}

function info(text) {
  console.log(chalk.blue(`  ℹ ${text}`));
}

function hint(text) {
  console.log(chalk.gray(`    ${text}`));
}

// ─── Main Menu ───────────────────────────────────────────

async function mainMenu() {
  banner();

  let running = true;
  while (running) {
    console.log("");
    console.log(chalk.white.bold("  O que você quer fazer?"));
    console.log("");
    console.log(`  ${chalk.cyan("1")} → Transcrever 1 vídeo`);
    console.log(`  ${chalk.cyan("2")} → Processar vários vídeos (fila)`);
    console.log(`  ${chalk.cyan("3")} → Cortar vídeos (process-cuts)`);
    console.log(`  ${chalk.cyan("4")} → Ver status dos jobs`);
    console.log(`  ${chalk.red("5")} → Sair`);
    console.log("");

    const { action } = await inquirer.prompt([
      {
        type: "input",
        name: "action",
        message: "Digite o número:",
        validate: (input) =>
          ["1", "2", "3", "4", "5"].includes(input.trim())
            ? true
            : "Digite um número de 1 a 5",
      },
    ]);

    const actionMap = {
      "1": "transcribe",
      "2": "batch",
      "3": "cuts",
      "4": "status",
      "5": "exit",
    };
    const chosen = actionMap[action.trim()];

    switch (chosen) {
      case "transcribe":
        await handleTranscribe();
        break;
      case "batch":
        await handleBatch();
        break;
      case "cuts":
        await handleProcessCuts();
        break;
      case "status":
        handleStatus();
        break;
      case "exit":
        running = false;
        console.log("");
        console.log(chalk.gray("  Até mais!"));
        console.log("");
        break;
    }
  }
}

// ─── Transcrever 1 vídeo ────────────────────────────────

async function handleTranscribe() {
  sectionTitle("Transcrever 1 vídeo");

  const { url } = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message: "Cole o link do vídeo:",
      validate: (input) =>
        input.includes("youtube.com") || input.includes("youtu.be")
          ? true
          : "Cole um link válido do YouTube",
    },
  ]);

  const startTime = Date.now();

  try {
    // Download
    let spinner = ora(chalk.blue("Baixando vídeo...")).start();
    const { videoPath, audioPath } = download(url);
    spinner.succeed(chalk.green("Vídeo baixado"));

    // Transcrição
    spinner = ora(
      chalk.blue("Transcrevendo com Whisper local (pode demorar)...")
    ).start();
    const { text } = transcribe(audioPath);
    spinner.succeed(chalk.green("Transcrição completa"));

    // Prompt
    const promptText = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", text);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const promptPath = path.join(OUTPUT_DIR, "prompt_claude.txt");
    fs.writeFileSync(promptPath, promptText, "utf-8");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    console.log("");
    success(`Concluído em ${elapsed}s`);
    console.log("");
    info("Próximos passos:");
    hint("1. Abra: output/prompt_claude.txt");
    hint("2. Copie tudo e cole no Claude (claude.ai)");
    hint("3. Salve o JSON em: output/cortes.json");
    hint('4. Volte aqui e escolha "Cortar vídeos"');
    console.log("");
  } catch (err) {
    error(`Falha: ${err.message}`);
  }

  await pause();
}

// ─── Batch (vários vídeos) ──────────────────────────────

async function handleBatch() {
  sectionTitle("Processar vários vídeos em fila");

  console.log("");
  console.log(`  ${chalk.cyan("1")} → Colar links aqui no terminal`);
  console.log(`  ${chalk.cyan("2")} → Usar arquivo videos.txt`);
  console.log("");

  const { methodChoice } = await inquirer.prompt([
    {
      type: "input",
      name: "methodChoice",
      message: "Escolha (1 ou 2):",
      validate: (input) =>
        ["1", "2"].includes(input.trim()) ? true : "Digite 1 ou 2",
    },
  ]);

  const method = methodChoice.trim() === "1" ? "paste" : "file";

  let urls = [];

  if (method === "paste") {
    console.log("");
    info("Cole um link por vez e pressione Enter.");
    info('Quando terminar, digite "FIM" e pressione Enter.');
    console.log("");

    urls = [];
    let adding = true;
    while (adding) {
      const { link } = await inquirer.prompt([
        {
          type: "input",
          name: "link",
          message: `Link ${urls.length + 1} (ou FIM):`,
        },
      ]);

      const trimmed = link.trim();
      if (!trimmed || trimmed.toUpperCase() === "FIM") {
        adding = false;
      } else if (
        trimmed.includes("youtube.com") ||
        trimmed.includes("youtu.be")
      ) {
        urls.push(trimmed);
      } else {
        error("Link inválido. Cole um link do YouTube.");
      }
    }
  } else {
    const filePath = path.join(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
      "..",
      "videos.txt"
    );

    if (!fs.existsSync(filePath)) {
      error("Arquivo videos.txt não encontrado na raiz do projeto");
      hint("Crie o arquivo com um link por linha");
      await pause();
      return;
    }

    urls = fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }

  if (urls.length === 0) {
    error("Nenhum link válido encontrado");
    await pause();
    return;
  }

  console.log("");
  info(`${urls.length} vídeo(s) na fila`);
  console.log("");

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Iniciar processamento de ${urls.length} vídeo(s)?`,
      default: true,
    },
  ]);

  if (!confirm) return;

  const startTime = Date.now();
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const progress = `[${i + 1}/${urls.length}]`;

    console.log("");
    console.log(
      chalk.cyan.bold(`  ${progress} Processando...`)
    );
    hint(url);

    const { jobDir, slug, alreadyExists } = createJobDir(i + 1, url);

    if (alreadyExists && isAlreadyProcessed(jobDir)) {
      info(`Pulando ${slug} (já processado)`);
      skipCount++;
      continue;
    }

    try {
      updateStatus(jobDir, "baixando", url);
      let spinner = ora(chalk.blue(`${progress} Baixando...`)).start();
      const { videoPath, audioPath } = download(url, jobDir);
      spinner.succeed(chalk.green(`${progress} Download completo`));

      updateStatus(jobDir, "transcrevendo");
      spinner = ora(
        chalk.blue(`${progress} Transcrevendo...`)
      ).start();
      const { text } = transcribe(audioPath, jobDir);
      spinner.succeed(chalk.green(`${progress} Transcrição completa`));

      const promptText = PROMPT_TEMPLATE.replace("{{TRANSCRICAO}}", text);
      fs.writeFileSync(
        path.join(jobDir, "prompt_claude.txt"),
        promptText,
        "utf-8"
      );

      updateStatus(jobDir, "aguardando_cortes");
      success(`${slug} pronto`);
      successCount++;
    } catch (err) {
      updateStatus(jobDir, "erro");
      error(`${progress} Falha: ${err.message}`);
      errorCount++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log("");
  sectionTitle("Batch completo");
  info(`Tempo total: ${elapsed} minutos`);
  console.log(
    `  ${chalk.green(`✔ ${successCount}`)} sucesso  ${chalk.gray(
      `⊘ ${skipCount}`
    )} pulados  ${chalk.red(`✖ ${errorCount}`)} erros`
  );
  console.log("");
  info("Agora abra cada prompt_claude.txt em jobs/ e cole no Claude.");
  info("Salve o JSON como cortes.json na pasta do job.");
  hint('Depois volte e escolha "Cortar vídeos".');
  console.log("");

  await pause();
}

// ─── Process Cuts ────────────────────────────────────────

async function handleProcessCuts() {
  sectionTitle("Cortando vídeos de todos os jobs");

  const jobs = listJobs();
  if (jobs.length === 0) {
    error("Nenhum job encontrado em jobs/");
    await pause();
    return;
  }

  // Encontra jobs prontos pra cortar
  const ready = jobs.filter((j) => {
    const cutsPath = path.join(j.dir, "cortes.json");
    const videoPath = path.join(j.dir, "video.mp4");
    return (
      j.status.status !== "finalizado" &&
      fs.existsSync(cutsPath) &&
      fs.existsSync(videoPath)
    );
  });

  if (ready.length === 0) {
    info("Nenhum job pronto pra cortar.");
    hint("Verifique se os arquivos cortes.json estão nas pastas dos jobs.");
    await pause();
    return;
  }

  info(`${ready.length} job(s) pronto(s) pra cortar`);

  // Também tenta cortar do output/ (fluxo single)
  const singleVideoPath = path.join(TEMP_DIR, "video.mp4");
  const singleCutsPath = path.join(OUTPUT_DIR, "cortes.json");
  const hasSingle =
    fs.existsSync(singleVideoPath) && fs.existsSync(singleCutsPath);

  if (hasSingle) {
    info("Também encontrou cortes no output/ (modo single)");
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Cortar ${ready.length} job(s)?`,
      default: true,
    },
  ]);

  if (!confirm) return;

  let cutCount = 0;
  let errorCount = 0;

  // Jobs
  for (const job of ready) {
    const cutsPath = path.join(job.dir, "cortes.json");
    const videoPath = path.join(job.dir, "video.mp4");
    const outputDir = path.join(job.dir, "output");

    console.log("");
    const spinner = ora(chalk.blue(`Cortando: ${job.name}`)).start();

    try {
      updateStatus(job.dir, "cortando");
      const cuts = parseCutsFile(cutsPath);
      const generatedFiles = cutVideos(videoPath, cuts, outputDir);
      updateStatus(job.dir, "finalizado");
      spinner.succeed(
        chalk.green(`${job.name}: ${generatedFiles.length} shorts`)
      );
      cutCount++;
    } catch (err) {
      updateStatus(job.dir, "erro");
      spinner.fail(chalk.red(`${job.name}: ${err.message}`));
      errorCount++;
    }
  }

  // Single mode
  if (hasSingle) {
    const spinner = ora(chalk.blue("Cortando: output/ (single)")).start();
    try {
      const cuts = parseCutsFile(singleCutsPath);
      const generatedFiles = cutVideos(singleVideoPath, cuts);
      spinner.succeed(
        chalk.green(`output/: ${generatedFiles.length} shorts`)
      );
    } catch (err) {
      spinner.fail(chalk.red(`output/: ${err.message}`));
    }
  }

  console.log("");
  success(`Cortados: ${cutCount} | Erros: ${errorCount}`);
  console.log("");

  await pause();
}

// ─── Status ──────────────────────────────────────────────

function handleStatus() {
  sectionTitle("Status dos jobs");

  const jobs = listJobs();
  if (jobs.length === 0) {
    info("Nenhum job encontrado");
    return;
  }

  const icons = {
    criado: chalk.gray("○"),
    baixando: chalk.blue("◐"),
    transcrevendo: chalk.blue("◑"),
    aguardando_cortes: chalk.yellow("◒"),
    cortando: chalk.blue("◓"),
    finalizado: chalk.green("●"),
    erro: chalk.red("✖"),
  };

  for (const job of jobs) {
    const icon = icons[job.status.status] || chalk.gray("?");
    const statusText =
      job.status.status === "finalizado"
        ? chalk.green(job.status.status)
        : job.status.status === "erro"
          ? chalk.red(job.status.status)
          : job.status.status === "aguardando_cortes"
            ? chalk.yellow(job.status.status)
            : chalk.blue(job.status.status);

    const hasCuts = fs.existsSync(path.join(job.dir, "cortes.json"));
    const note =
      job.status.status === "aguardando_cortes" && hasCuts
        ? chalk.green(" ← cortes.json pronto!")
        : "";

    console.log(`  ${icon} ${chalk.white(job.name)} → ${statusText}${note}`);
  }

  console.log("");

  const aguardando = jobs.filter(
    (j) => j.status.status === "aguardando_cortes"
  );
  const comCortes = aguardando.filter((j) =>
    fs.existsSync(path.join(j.dir, "cortes.json"))
  );
  const finalizados = jobs.filter((j) => j.status.status === "finalizado");

  console.log(chalk.gray(`  Total: ${jobs.length} jobs`));
  console.log(chalk.yellow(`  Aguardando cortes: ${aguardando.length}`));
  console.log(chalk.green(`  Prontos pra cortar: ${comCortes.length}`));
  console.log(chalk.green(`  Finalizados: ${finalizados.length}`));
  console.log("");
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

async function pause() {
  await inquirer.prompt([
    {
      type: "input",
      name: "ok",
      message: chalk.gray("Pressione Enter para voltar ao menu..."),
    },
  ]);
}

// ─── Start ───────────────────────────────────────────────

mainMenu().catch((err) => {
  console.error(chalk.red(`Erro fatal: ${err.message}`));
  process.exit(1);
});
