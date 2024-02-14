export class HeadsetChangesQueue {
    static toDoQueue = [];
    static processingPromise = false;

    static queueHeadsetChanges(fn: () => Promise<any> | any) {
      return new Promise<void>((resolve, reject) => {
        this.toDoQueue.push({
          fn,
          resolve,
          reject
        });

        if (!this.processingPromise) {
          this.dequeueHeadsetChanges();
        }
      });
    }

    static async dequeueHeadsetChanges() {
      if (this.processingPromise) {
        return false;
      }

      const item = this.toDoQueue.shift();
      if (!item) {
        return false;
      }

      try {
        this.processingPromise = true;
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      } finally {
        this.processingPromise = false;
        this.dequeueHeadsetChanges();
      }
    }

    static clearQueue() {
      this.toDoQueue = [];
    }
  }