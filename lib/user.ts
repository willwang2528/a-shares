import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function currentUserIdentity() {
  const user = await getChatGPTUser();
  if (!user) {
    return { id: "local-user", email: undefined, displayName: "本机用户" };
  }
  const bytes = new TextEncoder().encode(user.email.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const id = Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return { id: `user-${id}`, email: user.email, displayName: user.displayName };
}
