import { useSelector } from 'react-redux';
import Card from './Card';
import { RootState } from '../types/store';

export default function InteractionLog() {
  const entries = useSelector((state: RootState) => state.sdkSignals.interactionLog);

  return (
    <Card className="interaction-log-card">
      <h3>Interaction Log</h3>
      <div data-testid="interaction-log" data-count={entries.length}>
        {entries.length ? (
          <table>
            <thead>
              <tr>
                <th>Conversation ID</th>
                <th>Type</th>
                <th>End Reason</th>
                <th>Final State</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={`${entry.sessionType}-${entry.conversationId}`}
                  data-testid="interaction-log-entry"
                  data-conversation-id={entry.conversationId}
                >
                  <td data-testid="interaction-log-conversation-id">{entry.conversationId}</td>
                  <td>{entry.sessionType}</td>
                  <td data-testid="interaction-log-end-reason">{entry.endReason ?? 'unknown'}</td>
                  <td data-testid="interaction-log-final-state">{entry.finalState ?? 'unknown'}</td>
                  <td>{entry.recordedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No completed calls.</p>
        )}
      </div>
    </Card>
  );
}
