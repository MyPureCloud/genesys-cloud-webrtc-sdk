import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';

export default function SdkSignals() {
  const lastError = useSelector((state: RootState) => state.sdkSignals.lastError);
  const connected = useSelector((state: RootState) => state.sdkSignals.connected);

  return (
    <Card className="sdk-signals-card">
      <h3>SDK Status</h3>
      <p>
        Streaming connection:{' '}
        <span data-testid="connection-state" data-connected={String(connected)}>
          {connected ? 'connected' : 'not connected'}
        </span>
      </p>
      <div data-testid="sdk-error" data-state={lastError ? 'error' : 'none'}>
        Last SDK error:{' '}
        <span data-testid="sdk-error-type">{lastError?.type ?? ''}</span>
        {lastError ? ': ' : 'none'}
        <span data-testid="sdk-error-message">{lastError?.message ?? ''}</span>
      </div>
    </Card>
  );
}
