import React from "react";
import { Composition } from "remotion";
import { MotionVideo } from "./Video";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MotionGraphics30"
    component={MotionVideo}
    durationInFrames={900}
    fps={30}
    width={1080}
    height={1920}
  />
);
