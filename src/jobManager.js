const fs = require("fs");
const path = require("path");
const { JOBS_DIR } = require("./config");
const { log } = require("./logger");

function createJobDir(index, url) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });

  // Gera slug a partir do índice e do video ID
  const videoId = extractVideoId(url) || `video`;
  const slug = `${String(index).padStart(3, "0")}_${videoId}`;
  const jobDir = path.join(JOBS_DIR, slug);

  if (fs.existsSync(jobDir)) {
    log("JOB", `Job já existe: ${slug} (pulando criação)`);
    return { jobDir, slug, alreadyExists: true };
  }

  fs.mkdirSync(jobDir, { recursive: true });
  fs.mkdirSync(path.join(jobDir, "output"), { recursive: true });

  // Salva o link
  fs.writeFileSync(path.join(jobDir, "input.txt"), url, "utf-8");

  // Cria status inicial
  updateStatus(jobDir, "criado", url);

  return { jobDir, slug, alreadyExists: false };
}

function updateStatus(jobDir, status, videoUrl) {
  const statusPath = path.join(jobDir, "status.json");
  let data = {};

  if (fs.existsSync(statusPath)) {
    data = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
  }

  data.status = status;
  data.updatedAt = new Date().toISOString();
  if (videoUrl) data.videoUrl = videoUrl;
  if (!data.createdAt) data.createdAt = new Date().toISOString();

  fs.writeFileSync(statusPath, JSON.stringify(data, null, 2), "utf-8");
}

function getStatus(jobDir) {
  const statusPath = path.join(jobDir, "status.json");
  if (!fs.existsSync(statusPath)) return null;
  return JSON.parse(fs.readFileSync(statusPath, "utf-8"));
}

function listJobs() {
  if (!fs.existsSync(JOBS_DIR)) return [];

  return fs
    .readdirSync(JOBS_DIR)
    .filter((name) => {
      const statusPath = path.join(JOBS_DIR, name, "status.json");
      return fs.existsSync(statusPath);
    })
    .sort()
    .map((name) => ({
      name,
      dir: path.join(JOBS_DIR, name),
      status: getStatus(path.join(JOBS_DIR, name)),
    }));
}

function extractVideoId(url) {
  const match = url.match(
    /(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function isAlreadyProcessed(jobDir) {
  const status = getStatus(jobDir);
  return (
    status &&
    ["aguardando_cortes", "finalizado"].includes(status.status)
  );
}

module.exports = {
  createJobDir,
  updateStatus,
  getStatus,
  listJobs,
  isAlreadyProcessed,
};
