import { FormEvent, useCallback, useState } from "react";

interface UseVideoFormReturn {
  roomJid: string;
  setRoomJid: (value: string) => void;
  error: string | undefined;
  startConv: (callback: (roomJid: string) => Promise<{
    conversationId: string
  }>, event?: FormEvent<HTMLFormElement>) => Promise<void>;
}

export default function useVideoForm(initialRoomJid = "22@conference.com"): UseVideoFormReturn {
  const [roomJid, setRoomJid] = useState(initialRoomJid);
  const [error, setError] = useState<string | undefined>();

  const startConv = useCallback(async (callback: (roomJid: string) => Promise<{
    conversationId: string
  }>, event?: FormEvent<HTMLFormElement>) => {
    try {
      if (event) event.preventDefault();
      await callback(roomJid);
      setError(undefined);
    } catch (e: any) {
      setError(e.message);
    }
  }, [roomJid]);

  return { roomJid, setRoomJid, error, startConv };
}
