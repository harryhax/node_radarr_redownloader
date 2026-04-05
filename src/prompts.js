const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

function createPromptInterface() {
  return readline.createInterface({ input, output });
}

async function askInteger(readlineInterface, prompt, { defaultValue, min, max }) {
  while (true) {
    const defaultText = defaultValue !== undefined ? ` [default: ${defaultValue}]` : "";
    const answer = (await readlineInterface.question(`${prompt}${defaultText}: `)).trim();

    if (!answer && defaultValue !== undefined) {
      return defaultValue;
    }

    const value = Number.parseInt(answer, 10);

    if (!Number.isInteger(value)) {
      console.log("Please enter a whole number.");
      continue;
    }

    if (min !== undefined && value < min) {
      console.log(`Value must be at least ${min}.`);
      continue;
    }

    if (max !== undefined && value > max) {
      console.log(`Value must be at most ${max}.`);
      continue;
    }

    return value;
  }
}

async function askForConfirmation(readlineInterface) {
  const confirmation = (await readlineInterface.question("\nType YES to continue: ")).trim();
  return confirmation === "YES";
}

module.exports = {
  createPromptInterface,
  askInteger,
  askForConfirmation,
};
