import React from "react";
import { Composition } from "remotion";
import { buildTimeline, FPS, HEIGHT, WIDTH, type VideoProps } from "../lib/script";
import { calculateScriptMetadata, ScriptVideo } from "./ScriptVideo";
import { MotionVideo } from "./Video";

const sample = buildTimeline("Jangan tunggu semangat datang. Mulailah, meski langkahmu kecil. Disiplin membuatmu tetap bergerak. Mulai sekarang.", { kind: "auto" });
export const defaultScriptProps: VideoProps = {
  title: "Sebuah pengingat",
  scenes: sample.ok ? sample.scenes : [{ text: "Mulai sekarang.", durationInFrames: 90 }],
  style: "hybrid",
  palette: "violet",
  audioSrc: null,
  captions: true,
  music: null,
  speech: null,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ScriptVideo"
      component={ScriptVideo}
      durationInFrames={300}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultScriptProps}
      calculateMetadata={calculateScriptMetadata}
    />
    <Composition
      id="MotionGraphics30"
      component={MotionVideo}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
