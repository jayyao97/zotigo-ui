import type { MessageFileInput } from "../shared/messageFiles";
import type { MessageImageInput, SessionCommandResponse, ZotigoSession } from "../shared/zotigod";
import { currentHost } from "./hosts";

/** A new session's first message, owned by the backend so it outlives the page that submitted it. */
export interface FirstMessage {
  conversationId: string;
  clientMessageId: string;
  text: string;
  images: MessageImageInput[];
  files: MessageFileInput[];
  skills: string[];
}

export interface FirstMessageOutcome {
  session?: ZotigoSession;
  command?: SessionCommandResponse;
  error?: string;
  errorCode?: string;
  deliveryState?: "rejected" | "unknown";
}

interface Delivery {
  message: FirstMessage;
  /** Text with uploaded file references. Retries reuse it so the daemon sees identical input under the same id. */
  uploadedText?: string;
  attempt: Promise<FirstMessageOutcome>;
  settledAt?: number;
  /** Set once the daemon accepted the message; later retries return it instead of sending again. */
  delivered?: FirstMessageOutcome;
}

const retentionMs = 60 * 60_000;

export interface FirstMessageSender {
  upload(message: FirstMessage): Promise<string>;
  send(message: FirstMessage, text: string): Promise<{ session: ZotigoSession; command: SessionCommandResponse }>;
  failure(error: unknown, stage: "upload" | "send"): FirstMessageOutcome;
}

/**
 * Delivers first messages in the background of the request that created the
 * session. The request's host context carries into the delivery, and entries
 * are keyed by host so a page on another host can never see or retry them.
 */
export function createFirstMessageDeliveries(sender: FirstMessageSender) {
  const deliveries = new Map<string, Delivery>();
  const key = (clientMessageId: string) => `${currentHost()?.id ?? "local"}\u0000${clientMessageId}`;

  function prune() {
    const cutoff = Date.now() - retentionMs;
    for (const [id, delivery] of deliveries) if (delivery.settledAt !== undefined && delivery.settledAt < cutoff) deliveries.delete(id);
  }

  function run(delivery: Delivery): Promise<FirstMessageOutcome> {
    delivery.settledAt = undefined;
    delivery.attempt = (async (): Promise<FirstMessageOutcome> => {
      try {
        delivery.uploadedText ??= await sender.upload(delivery.message);
      } catch (error) {
        return sender.failure(error, "upload");
      }
      try {
        const result = await sender.send(delivery.message, delivery.uploadedText);
        // Confirmed: drop the payload, which is only needed for a retry.
        delivery.delivered = result;
        delivery.message = { ...delivery.message, images: [], files: [] };
        return result;
      } catch (error) {
        return sender.failure(error, "send");
      }
    })().finally(() => { delivery.settledAt = Date.now(); });
    return delivery.attempt;
  }

  return {
    /** Starts delivery without waiting for it. */
    start(message: FirstMessage): void {
      prune();
      const delivery: Delivery = { message, attempt: Promise.resolve({}) };
      deliveries.set(key(message.clientMessageId), delivery);
      void run(delivery);
    },
    /** The outcome of the latest attempt, waiting for it if it is still running. */
    async wait(clientMessageId: string): Promise<FirstMessageOutcome> {
      const delivery = deliveries.get(key(clientMessageId));
      if (!delivery) return { error: "This first message is no longer tracked; check the session before retrying.", deliveryState: "unknown" };
      return delivery.attempt;
    },
    /** Retries under the same id, or joins an attempt that is still running. */
    retry(message: FirstMessage): Promise<FirstMessageOutcome> {
      prune();
      const id = key(message.clientMessageId);
      const delivery = deliveries.get(id);
      // Without a record (e.g. after a backend restart) the caller's payload starts a fresh attempt.
      if (!delivery) {
        const fresh: Delivery = { message, attempt: Promise.resolve({}) };
        deliveries.set(id, fresh);
        return run(fresh);
      }
      if (delivery.message.conversationId !== message.conversationId) {
        return Promise.resolve({ error: "This message id belongs to another session.", deliveryState: "rejected" });
      }
      if (delivery.delivered) return Promise.resolve(delivery.delivered);
      return delivery.settledAt === undefined ? delivery.attempt : run(delivery);
    },
  };
}
