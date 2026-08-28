export function messageText(content) {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.message === "string") return content.message;
    return JSON.stringify(content, null, 2);
  }
  return "";
}

export const THINKING_STAGES = ["Reading your Magpie evidence…", "Still thinking — checking a few things…", "Almost there…"];

export const SEND_TIMEOUT_MS = 45_000;

export const CHECKING_STAGES = ["Checking…", "Still checking — some sources are slow…", "Almost done…"];
