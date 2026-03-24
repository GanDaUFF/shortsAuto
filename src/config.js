const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const OUTPUT_DIR = path.join(ROOT_DIR, "output");
const JOBS_DIR = path.join(ROOT_DIR, "jobs");
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");

module.exports = {
  ROOT_DIR,
  TEMP_DIR,
  OUTPUT_DIR,
  JOBS_DIR,
  SCRIPTS_DIR,
};
