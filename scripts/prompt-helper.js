import readline from "readline";

/**
 * Prompts the operator for a password in the terminal with hidden text entry.
 */
export function promptHiddenPassword(query = "Enter password: ") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const stdin = process.stdin;
    let password = "";

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    process.stdout.write(query);

    function onData(char) {
      const str = char.toString("utf8");
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === "\n" || c === "\r" || c === "\u0004") {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.removeListener("data", onData);
          rl.close();
          process.stdout.write("\n");
          return resolve(password);
        } else if (c === "\u0003") {
          if (stdin.isTTY) stdin.setRawMode(false);
          process.exit(1);
        } else if (c === "\u0008" || c === "\x7f") {
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += c;
        }
      }
    }

    stdin.on("data", onData);
  });
}

/**
 * Prompts for a password and confirmation, verifying they match, or accepts an environment variable.
 */
export async function getSecurePasswordInput(envVarName, promptLabel = "Password") {
  if (process.env[envVarName] && process.env[envVarName].trim()) {
    const envPass = process.env[envVarName].trim();
    if (envPass.length < 6) {
      throw new Error(`Password in ${envVarName} must be at least 6 characters.`);
    }
    return envPass;
  }

  const pass1 = await promptHiddenPassword(`${promptLabel}: `);
  if (!pass1 || pass1.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const pass2 = await promptHiddenPassword(`Confirm ${promptLabel}: `);
  if (pass1 !== pass2) {
    throw new Error("Password confirmation does not match.");
  }

  return pass1;
}
