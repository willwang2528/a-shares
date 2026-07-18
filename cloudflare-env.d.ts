import "cloudflare:workers";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TUSHARE_TOKEN?: string;
      SCHEDULER_SECRET?: string;
      LLM_API_KEY?: string;
      LLM_BASE_URL?: string;
      LLM_MODEL?: string;
      SERVERCHAN_SENDKEY?: string;
      RESEND_API_KEY?: string;
    }
  }
}
