import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const HOOK = "https://chat.googleapis.com/v1/spaces/AAA/messages?key=K&token=T";
const card = { title: "Timesheet reminder", subtitle: "Asha Rao", text: "Hi Asha, please add your time log.", mention: "123456789012345678901" };

describe("sendChat threads", () => {
  const fetchMock = vi.fn<(...a: unknown[]) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    process.env.GOOGLE_CHAT_WEBHOOK_URL = HOOK;
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("puts a person's messages in their own thread, keeping the webhook key", async () => {
    const { sendChat } = await import("@/lib/google-chat");
    await sendChat({ ...card, threadKey: "timesheet-abc-123" });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("threadKey")).toBe("timesheet-abc-123");
    expect(url.searchParams.get("messageReplyOption")).toBe("REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
    expect(url.searchParams.get("key")).toBe("K");
    expect(url.searchParams.get("token")).toBe("T");
  });

  it("posts a plain message when there is no thread key, or the key is not safe", async () => {
    const { sendChat } = await import("@/lib/google-chat");
    await sendChat(card);
    await sendChat({ ...card, threadKey: "bad key&x=1" });
    for (const [u] of fetchMock.mock.calls) expect(new URL(String(u)).searchParams.has("threadKey")).toBe(false);
  });
});
