export interface NotificationResult {
  channel: "browser" | "serverchan" | "email";
  status: "sent" | "needs_config" | "failed";
  message: string;
}

export interface NotificationProvider {
  name: string;
  send(title: string, body: string, url?: string): Promise<NotificationResult>;
}

class UnavailableProvider implements NotificationProvider {
  name = "unavailable";
  constructor(private readonly channel: NotificationResult["channel"]) {}
  async send(): Promise<NotificationResult> {
    return {
      channel: this.channel,
      status: "needs_config",
      message:
        this.channel === "browser"
          ? "浏览器通知需要在当前设备上点击‘测试本机通知’。"
          : "当前真实通知渠道尚未配置服务端密钥。",
    };
  }
}

class ServerChanProvider implements NotificationProvider {
  name = "serverchan";
  constructor(private readonly sendKey: string) {}
  async send(title: string, body: string, url?: string): Promise<NotificationResult> {
    try {
      const payload = new URLSearchParams({
        title,
        desp: `${body}${url ? `\n\n[打开盘面](${url})` : ""}`,
      });
      const response = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(this.sendKey)}.send`, {
        method: "POST",
        body: payload,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return { channel: "serverchan", status: "failed", message: `服务返回 HTTP ${response.status}` };
      }
      return { channel: "serverchan", status: "sent", message: "Server酱已接受消息。" };
    } catch {
      return { channel: "serverchan", status: "failed", message: "Server酱请求超时或网络失败。" };
    }
  }
}

class EmailProvider implements NotificationProvider {
  name = "email";
  constructor(
    private readonly apiKey: string,
    private readonly to: string,
    private readonly from: string,
  ) {}
  async send(title: string, body: string, url?: string): Promise<NotificationResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.from,
          to: [this.to],
          subject: title,
          text: `${body}${url ? `\n\n打开盘面：${url}` : ""}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return { channel: "email", status: "failed", message: `邮件服务返回 HTTP ${response.status}` };
      }
      return { channel: "email", status: "sent", message: "邮件服务已接受消息。" };
    } catch {
      return { channel: "email", status: "failed", message: "邮件请求超时或网络失败。" };
    }
  }
}

export function getNotificationProvider(env: Record<string, string | undefined>, preferred?: string) {
  if (preferred === "serverchan" && env.SERVERCHAN_SENDKEY) return new ServerChanProvider(env.SERVERCHAN_SENDKEY);
  if (preferred === "email" && env.RESEND_API_KEY && env.NOTIFICATION_EMAIL && env.NOTIFICATION_FROM) {
    return new EmailProvider(env.RESEND_API_KEY, env.NOTIFICATION_EMAIL, env.NOTIFICATION_FROM);
  }
  const channel = preferred === "email" || preferred === "serverchan" ? preferred : "browser";
  return new UnavailableProvider(channel);
}
