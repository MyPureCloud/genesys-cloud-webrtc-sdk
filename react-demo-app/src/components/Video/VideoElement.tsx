import { RefObject } from "react";

export default function VideoElement({ talking, videoVisible, videoRef, showSvg, showWaitingForOthers, userId }: {
  talking: boolean,
  videoVisible: boolean,
  videoRef: RefObject<HTMLVideoElement>,
  showSvg: boolean,
  showWaitingForOthers: boolean,
  userId: string | undefined
}) {
  return (
    <div className={"video-section"}>
      <h4>Title here</h4>
      <div style={{
        borderRadius: '4px',
        boxSizing: "border-box",
        border: talking ? '10px solid rgb(121 222 176)' : '10px solid transparent'
      }}>
        <div className="video-element-container">
          <div style={{
            height: "100%", width: "100%",
            visibility: videoVisible ? 'visible' : 'hidden'
          }}>
            <video ref={videoRef} autoPlay playsInline/>
            {showSvg && <div className="logo-container">
              <img src="https://dhqbrvplips7x.cloudfront.net/volt/1.12.1-178/assets/default-person.svg"/>
            </div>}
            {showWaitingForOthers ? <div className="logo-container"
                                         style={{
                                           color: "#1b2c48",
                                           backgroundColor: "#f3f3f3",
                                           width: "100%",
                                           height: "100%"
                                         }}>
              <h3>Waiting for others to connect...</h3>
            </div> : null}
          </div>
        </div>
      </div>
      {userId ? <span style={{ color: "#1b2c48", fontWeight: 'bold' }}>User id: {userId}</span> : null}
    </div>
  )
}
