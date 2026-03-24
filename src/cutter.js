const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { OUTPUT_DIR } = require("./config");
const { log } = require("./logger");

function cutVideos(videoPath, cuts, outputDir) {
  const outDir = outputDir || OUTPUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const generatedFiles = [];

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    const index = String(i + 1).padStart(2, "0");

    const titulo = cut.titulo || `corte_${index}`;
    const safeName = titulo
      .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 50);

    const outputFile = path.join(outDir, `short_${index}_${safeName}.mp4`);

    log("CORTE", `Cortando short ${i + 1}/${cuts.length}: ${titulo}`);
    log("CORTE", `  ${cut.inicio} → ${cut.fim}`);

    try {
      execSync(
        `ffmpeg -i "${videoPath}" -ss ${cut.inicio} -to ${cut.fim} -c:v libx264 -c:a aac -y "${outputFile}"`,
        { stdio: "pipe" }
      );

      if (fs.existsSync(outputFile)) {
        const sizeMB = (fs.statSync(outputFile).size / (1024 * 1024)).toFixed(1);
        log("CORTE", `  Salvo: ${outputFile} (${sizeMB}MB)`);
        generatedFiles.push({
          file: outputFile,
          title: titulo,
        });
      }
    } catch (err) {
      log("CORTE", `  ERRO ao cortar: ${err.message}`);
    }
  }

  return generatedFiles;
}

module.exports = { cutVideos };
