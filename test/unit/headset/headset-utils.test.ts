import { HeadsetChangesQueue } from "../../../src/headsets/headset-utils";
import { flushPromises } from "../../test-utils";

describe('HeadsetChangesQueue', () => {
    it ('should reject with err if something goes wrong trying to run the passed in function', async () => {
      const error = new Error('Uh oh');
      const rejectTest = jest.fn().mockImplementation(() => {
        throw error;
      });

      await HeadsetChangesQueue.queueHeadsetChanges(() => rejectTest()).catch((err) => {
        expect(err).toBeTruthy();
      });
    });

    it('should properly queue up events that are passed in and dequeue them in the order in which they were passed in', async () => {
      const printTest = jest.fn().mockImplementation((testNumber, testDelay) => {
        return `This is test number ${testNumber}`;
      });

      HeadsetChangesQueue.queueHeadsetChanges(() => printTest(1));
      await flushPromises();

      HeadsetChangesQueue.queueHeadsetChanges(() => printTest(2));
      await flushPromises();

      HeadsetChangesQueue.queueHeadsetChanges(() => printTest(3));
      await flushPromises();

      expect(printTest).toHaveNthReturnedWith(1, 'This is test number 1');
      expect(printTest).toHaveNthReturnedWith(2, 'This is test number 2');
      expect(printTest).toHaveNthReturnedWith(3, 'This is test number 3');
    });

    it('should return false during dequeueHeadsetChanges if processingPromise is true', async () => {
      (HeadsetChangesQueue.toDoQueue as any[]) = [
        () => console.log('test 1')
      ];
      HeadsetChangesQueue.processingPromise = true;

      const dequeueResult = await HeadsetChangesQueue.dequeueHeadsetChanges();

      expect(dequeueResult).toBe(false);
    });

    it('should set the toDoQueue to an empty array when clearQueue is called', () => {
      (HeadsetChangesQueue.toDoQueue as any[]) = [
        () => console.log('test 1'),
        () => console.log('test 2')
      ];
      expect(HeadsetChangesQueue.toDoQueue.length).toBe(2);
      HeadsetChangesQueue.clearQueue();
      expect(HeadsetChangesQueue.toDoQueue.length).toBe(0);
    });

    it('should not call dequeueHeadsetChanges if processingPromise is true', () => {
      HeadsetChangesQueue.processingPromise = true;
      const printTest = jest.fn().mockImplementation((testNumber, testDelay) => {
        return `This is test number ${testNumber}`;
      });
      const dequeueSpy = jest.spyOn(HeadsetChangesQueue, 'dequeueHeadsetChanges');
      HeadsetChangesQueue.queueHeadsetChanges(() => printTest(1));
      expect(dequeueSpy).not.toBeCalled();
    })
})