function log(step, message) {
  const time = new Date().toLocaleTimeString("pt-BR");
  console.log(`[${time}] [${step}] ${message}`);
}

function divider() {
  console.log("─".repeat(60));
}

function header(text) {
  divider();
  console.log(`  ${text}`);
  divider();
}

module.exports = { log, divider, header };
