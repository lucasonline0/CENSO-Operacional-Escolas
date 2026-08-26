// Utilitários de geração de senha segura e cópia para a área de transferência.

export function generateSecurePassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude I, O to avoid confusion
  const lower = "abcdefghijkmnopqrstuvwxyz"; // exclude l to avoid confusion
  const numbers = "23456789"; // exclude 0, 1 to avoid confusion
  const symbols = "!@#$%&*+?";

  const all = upper + lower + numbers + symbols;

  // Garantir pelo menos um de cada grupo
  const getRandomChar = (charset: string): string => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return charset[arr[0] % charset.length];
    }
    return charset[Math.floor(Math.random() * charset.length)];
  };

  const pwdChars: string[] = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(numbers),
    getRandomChar(symbols),
  ];

  for (let i = pwdChars.length; i < length; i++) {
    pwdChars.push(getRandomChar(all));
  }

  // Embaralhar (Fisher-Yates)
  for (let i = pwdChars.length - 1; i > 0; i--) {
    let j = 0;
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    const temp = pwdChars[i];
    pwdChars[i] = pwdChars[j];
    pwdChars[j] = temp;
  }

  return pwdChars.join("");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback abaixo
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export function formatCredentialsText({
  dre,
  username,
  password,
  url,
}: {
  dre: string;
  username: string;
  password?: string;
  url?: string;
}): string {
  const parts = [
    "SEDUC-PA · Censo Operacional das Escolas",
    "Credenciais de Acesso ao Painel Administrativo",
    "--------------------------------------------------",
    `DRE / Regional: ${dre}`,
    `Usuário: ${username}`,
  ];
  if (password) {
    parts.push(`Senha de Acesso: ${password}`);
  }
  if (url) {
    parts.push(`Link do Painel: ${url}`);
  }
  parts.push("--------------------------------------------------");
  parts.push("Atenção: Guarde esta senha em local seguro.");
  return parts.join("\n");
}
