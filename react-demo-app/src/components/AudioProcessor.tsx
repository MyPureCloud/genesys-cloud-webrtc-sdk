import Card from "./Card";
import { GuxButton, GuxStatusIndicatorBeta } from "genesys-spark-components-react";
import useSdk from "../hooks/useSdk";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../types/store";
import { setAudioProcessor } from "../features/audioProcessorSlice";

export default function AudioProcessor() {
  const dispatch = useDispatch();
  const { initAudioProcessor } = useSdk();
  const audioProcessor = useSelector((state: RootState) => state.audioProcessor.audioProcessor);

  function destroyAudioProcessor() {
    if (!audioProcessor) {
      return;
    }
    dispatch(setAudioProcessor(undefined));
    audioProcessor.destroy();
  }

  function audioProcessorStatus() {
    if (audioProcessor) {
      return <GuxStatusIndicatorBeta accent="success">
        <span>Audio Processor Active</span>
      </GuxStatusIndicatorBeta>;
    }
    return <GuxStatusIndicatorBeta accent="error">
      <span>Audio Processor Inactive</span>
    </GuxStatusIndicatorBeta>;
  }

  return (
    <Card className="softphone-audio-processor-card">
      <h3>Audio Processor</h3>
      { audioProcessorStatus() }
      <GuxButton
        accent="secondary"
        className="softphone-disconnect-btn"
        onClick={() => initAudioProcessor()}
        disabled={audioProcessor ? true : false}
      >
        Init Audio Processor
      </GuxButton>
      <GuxButton
        accent="secondary"
        className="softphone-disconnect-btn"
        onClick={() => destroyAudioProcessor()}
        disabled={audioProcessor ? false : true}
      >
        Destroy Audio Processor
      </GuxButton>
    </Card>
  );
}
