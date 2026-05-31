import { encryptData, decryptData } from './crypto';

const QUEUE_KEY = "compliance_action_queue";

export interface QueuedAction {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  payload: unknown;
  timestamp: number;
  retries: number;
  label: string; // human-readable, e.g. "Submit Risk Assessment"
}

class ActionQueue {
  private async getQueue(): Promise<QueuedAction[]> {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (!stored) return [];
      const decrypted = await decryptData<QueuedAction[]>(stored);
      return decrypted || [];
    } catch {
      return [];
    }
  }

  private async saveQueue(queue: QueuedAction[]): Promise<void> {
    const encrypted = await encryptData(queue);
    localStorage.setItem(QUEUE_KEY, encrypted);
  }

  async enqueue(action: Omit<QueuedAction, "id" | "timestamp" | "retries">): Promise<string> {
    const id = crypto.randomUUID();
    const queue = await this.getQueue();
    queue.push({ ...action, id, timestamp: Date.now(), retries: 0 });
    await this.saveQueue(queue);
    // console.log(`[Queue] Enqueued (Encrypted): ${action.label}`);
    return id;
  }

  async dequeue(id: string): Promise<void> {
    const queue = (await this.getQueue()).filter((a) => a.id !== id);
    await this.saveQueue(queue);
  }

  async getPending(): Promise<QueuedAction[]> {
    return await this.getQueue();
  }

  async size(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  async flush(
    onProgress?: (action: QueuedAction, success: boolean) => void
  ): Promise<{ success: number; failed: number }> {
    const queue = await this.getQueue();
    let success = 0;
    let failed = 0;
    
    // Create a copy for modification during iteration
    let currentQueue = [...queue];

    for (const action of queue) {
      try {
        const res = await fetch(action.endpoint, {
          method: action.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.payload),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        currentQueue = currentQueue.filter(a => a.id !== action.id);
        await this.saveQueue(currentQueue);
        success++;
        onProgress?.(action, true);
      } catch (err) {
        // Increment retry count; drop after 5 attempts
        currentQueue = currentQueue.map((a) =>
          a.id === action.id ? { ...a, retries: a.retries + 1 } : a
        ).filter((a) => a.retries < 5);
        await this.saveQueue(currentQueue);
        failed++;
        onProgress?.(action, false);
      }
    }

    return { success, failed };
  }
}

export const actionQueue = new ActionQueue();
