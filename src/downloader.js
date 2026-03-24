const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { TEMP_DIR } = require("./config");
const { log } = require("./logger");

function download(url, destDir) {
  const dir = destDir || TEMP_DIR;
  fs.mkdirSync(dir, { recursive: true });

  const videoPath = path.join(dir, "video.mp4");
  const audioPath = path.join(dir, "audio.mp3");

  log("DOWNLOAD", "Baixando vídeo...");
  execSync(
    `yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4 -o "${videoPath}" --no-playlist "${url}"`,
    { stdio: "inherit" }
  );

  if (!fs.existsSync(videoPath)) {
    throw new Error("Falha ao baixar o vídeo");
  }
  log("DOWNLOAD", `Vídeo salvo: ${videoPath}`);

  log("DOWNLOAD", "Extraindo áudio para transcrição...");
  execSync(
    `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`,
    { stdio: "inherit" }
  );

  log("DOWNLOAD", `Áudio salvo: ${audioPath}`);

  return { videoPath, audioPath };
}

module.exports = { download };
