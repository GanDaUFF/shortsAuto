const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { TEMP_DIR, OUTPUT_DIR, SCRIPTS_DIR } = require("./config");
const { log } = require("./logger");

function transcribe(audioPath, outputDir) {
  const outDir = outputDir || OUTPUT_DIR;
  const tempDir = path.dirname(audioPath);
  const jsonOutput = path.join(tempDir, "transcription.json");
  const scriptPath = path.join(SCRIPTS_DIR, "whisper_transcribe.py");

  log("TRANSCRIÇÃO", "Iniciando Whisper local (isso pode demorar alguns minutos)...");

  execSync(`python "${scriptPath}" "${audioPath}" "${jsonOutput}"`, {
    stdio: "inherit",
  });

  if (!fs.existsSync(jsonOutput)) {
    throw new Error("Whisper não gerou o arquivo de transcrição");
  }

  const data = JSON.parse(fs.readFileSync(jsonOutput, "utf-8"));
  log("TRANSCRIÇÃO", `${data.segments.length} segmentos encontrados`);

  const transcriptionText = data.segments
    .map((s) => `[${s.startFormatted} - ${s.endFormatted}] ${s.text}`)
    .join("\n");

  fs.mkdirSync(outDir, { recursive: true });

  const txtPath = path.join(outDir, "transcricao.txt");
  fs.writeFileSync(txtPath, transcriptionText, "utf-8");
  log("TRANSCRIÇÃO", `Transcrição salva: ${txtPath}`);

  return { segments: data.segments, text: transcriptionText };
}

module.exports = { transcribe };
