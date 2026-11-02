import { Composition } from 'remotion';
import { Demo, durationInFrames } from './Demo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Wide" component={Demo} durationInFrames={durationInFrames(30)} fps={30} width={1920} height={1080} />
      <Composition id="Square" component={Demo} durationInFrames={durationInFrames(30)} fps={30} width={1080} height={1080} />
    </>
  );
};
